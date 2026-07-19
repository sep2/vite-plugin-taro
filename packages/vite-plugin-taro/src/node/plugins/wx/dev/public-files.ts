import fs from 'node:fs/promises'
import path from 'node:path'
import { catchError, concatMap, EMPTY, endWith, firstValueFrom, from, ignoreElements, Subject, share } from 'rxjs'

interface Watcher {
    on(event: 'all', listener: (event: string, filePath: string) => void): unknown
    off(event: 'all', listener: (event: string, filePath: string) => void): unknown
}

type PublicFileEvent = Readonly<{
    event: string
    filePath: string
}>

/** Prepares the physical destination before DevEngine performs its initial complete build. */
export async function preparePublicFiles({
    emptyOutDir,
    outDir,
    publicDir
}: {
    emptyOutDir: boolean
    outDir: string
    publicDir: string
}): Promise<void> {
    if (emptyOutDir) {
        await fs.rm(outDir, { recursive: true, force: true })
    }
    await fs.mkdir(outDir, { recursive: true })

    if (!publicDir) {
        return
    }

    try {
        await fs.cp(publicDir, outDir, { recursive: true, force: true })
    } catch (error) {
        if (!isMissingFileError(error)) {
            throw error
        }
    }
}

/**
 * Mirrors later public-directory changes through one serialized edge lane.
 *
 * Public files are outside Rolldown's graph, so a successful physical change also requests a complete build boundary.
 */
export function watchPublicFiles({
    onChanged,
    onError,
    outDir,
    publicDir,
    watcher
}: {
    onChanged(): void
    onError(error: unknown): void
    outDir: string
    publicDir: string
    watcher: Watcher
}): { close(): Promise<void> } {
    const events$ = new Subject<PublicFileEvent>()
    const synchronization$ = events$.pipe(
        concatMap(({ event, filePath }) => {
            const destinationPath = getPublicDestination(outDir, publicDir, filePath)
            if (!destinationPath) {
                return EMPTY
            }

            return from(syncPublicFile(event, filePath, destinationPath)).pipe(
                concatMap((changed) => {
                    if (changed) {
                        onChanged()
                    }
                    return EMPTY
                }),
                catchError((error: unknown) => {
                    onError(error)
                    return EMPTY
                })
            )
        }),
        share()
    )
    const subscription = synchronization$.subscribe()
    const handleWatcherEvent = (event: string, filePath: string): void => {
        events$.next({ event, filePath })
    }

    watcher.on('all', handleWatcherEvent)

    return {
        async close(): Promise<void> {
            watcher.off('all', handleWatcherEvent)
            const completed = firstValueFrom(synchronization$.pipe(ignoreElements(), endWith(undefined)))
            events$.complete()
            await completed
            subscription.unsubscribe()
        }
    }
}

function getPublicDestination(outDir: string, publicDir: string, filePath: string): string | undefined {
    if (!publicDir) {
        return
    }

    const relativePath = path.relative(publicDir, filePath)
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return
    }
    return path.join(outDir, relativePath)
}

async function syncPublicFile(event: string, sourcePath: string, destinationPath: string): Promise<boolean> {
    if (event === 'unlink' || event === 'unlinkDir') {
        await fs.rm(destinationPath, { recursive: event === 'unlinkDir', force: true })
        return true
    }
    if (event === 'addDir') {
        await fs.mkdir(destinationPath, { recursive: true })
        return true
    }
    if (event !== 'add' && event !== 'change') {
        return false
    }

    await fs.mkdir(path.dirname(destinationPath), { recursive: true })
    await fs.copyFile(sourcePath, destinationPath)
    return true
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
