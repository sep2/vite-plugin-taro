import fs from 'node:fs/promises'
import path from 'node:path'
import { catchError, concatMap, EMPTY, endWith, firstValueFrom, from, ignoreElements, Subject } from 'rxjs'

type Watcher = Readonly<{
    off(event: 'all', listener: (event: string, filePath: string) => void): unknown
    on(event: 'all', listener: (event: string, filePath: string) => void): unknown
}>

type PublicFileEvent = Readonly<{
    event: string
    filePath: string
}>

/** Prepares physical public files before the first DevEngine full build. */
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
        await fs.rm(outDir, { force: true, recursive: true })
    }
    await fs.mkdir(outDir, { recursive: true })
    if (!publicDir) {
        return
    }
    try {
        await fs.cp(publicDir, outDir, { force: true, recursive: true })
    } catch (error) {
        if (!isMissingFileError(error)) {
            throw error
        }
    }
}

/**
 * Mirrors public files through one serialized edge lane, then asks the topology for a complete build.
 *
 * Public files are outside Rolldown's module graph, so a successful copy/delete cannot be represented as a patch.
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
}): Readonly<{ close(): Promise<void> }> {
    const events$ = new Subject<PublicFileEvent>()
    const synchronized$ = events$.pipe(
        concatMap(({ event, filePath }) => {
            const destination = getDestination(outDir, publicDir, filePath)
            if (!destination) {
                return EMPTY
            }
            return from(syncPublicFile(event, filePath, destination)).pipe(
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
        })
    )
    const subscription = synchronized$.subscribe()
    const onWatcherEvent = (event: string, filePath: string): void => events$.next({ event, filePath })
    watcher.on('all', onWatcherEvent)

    return {
        async close(): Promise<void> {
            watcher.off('all', onWatcherEvent)
            const complete = firstValueFrom(synchronized$.pipe(ignoreElements(), endWith(undefined)))
            events$.complete()
            await complete
            subscription.unsubscribe()
        }
    }
}

function getDestination(outDir: string, publicDir: string, filePath: string): string | undefined {
    if (!publicDir) {
        return
    }
    const relative = path.relative(publicDir, filePath)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return
    }
    return path.join(outDir, relative)
}

async function syncPublicFile(event: string, source: string, destination: string): Promise<boolean> {
    if (event === 'unlink' || event === 'unlinkDir') {
        await fs.rm(destination, { force: true, recursive: event === 'unlinkDir' })
        return true
    }
    if (event === 'addDir') {
        await fs.mkdir(destination, { recursive: true })
        return true
    }
    if (event !== 'add' && event !== 'change') {
        return false
    }
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(source, destination)
    return true
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
