import fs from 'node:fs/promises'
import path from 'node:path'

/** A serialized task sink shared with DevHost's initial output preparation. */
type TaskQueue = {
    enqueue(task: () => Promise<void>): void
}

type Watcher = {
    on(event: 'all', listener: (event: string, filePath: string) => void): unknown
    off(event: 'all', listener: (event: string, filePath: string) => void): unknown
}

/**
 * Performs the small part of Vite's prepare-out-dir behavior needed by physical bundled development.
 *
 * Rolldown owns every generated file because the DevEngine runs with skipWrite:false. This helper runs only before the
 * engine starts: it optionally removes the previous project, creates the destination, and copies public files that are
 * outside Rolldown's bundle graph.
 */
export async function initializePublicDirOutput({
    outDir,
    publicDir,
    emptyOutDir
}: {
    outDir: string
    publicDir: string
    emptyOutDir: boolean
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
        // Vite permits a configured/default public directory that does not exist. Match that behavior while preserving
        // every other filesystem failure, including permissions and invalid destinations.
        if (!isMissingFileError(error)) {
            throw error
        }
    }
}

/** Starts publicDir synchronization and returns the sole cleanup operation required when DevHost closes. */
export function createPublicDirWatcher({
    watcher,
    outDir,
    publicDir,
    taskQueue,
    reportError
}: {
    watcher: Watcher
    outDir: string
    publicDir: string
    taskQueue: TaskQueue
    reportError(error: unknown): void
}): () => void {
    const handleWatcherEvent = (event: string, filePath: string): void => {
        // Vite already watches the project and public directory. Ignore every event outside publicDir so source changes
        // remain exclusively owned by the DevEngine's watcher and cannot accidentally request a full rematerialization.
        const destinationPath = getPublicDestination(outDir, publicDir, filePath)
        if (!destinationPath) {
            return
        }

        // The queue was seeded with output preparation, so even an event received before listen() runs cannot race the
        // initial cleanup/copy. Public-file errors are recoverable and handled inside the task so they do not stop later
        // synchronization; the unhandled initial-preparation task remains fatal to startup.
        taskQueue.enqueue(async () => {
            try {
                await syncPublicDirFiles(event, filePath, destinationPath)
            } catch (error) {
                reportError(error)
            }
        })
    }

    watcher.on('all', handleWatcherEvent)
    return () => {
        watcher.off('all', handleWatcherEvent)
    }
}

/** Maps a path inside publicDir to its matching physical output location. */
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

/** Mirrors one Vite watcher event without rewriting any Rolldown-generated file. */
async function syncPublicDirFiles(event: string, sourcePath: string, destinationPath: string): Promise<void> {
    if (event === 'unlink' || event === 'unlinkDir') {
        // Recursive removal is reserved for an actual directory event so a malformed file event cannot remove siblings.
        await fs.rm(destinationPath, { recursive: event === 'unlinkDir', force: true })
        return
    }

    if (event === 'addDir') {
        await fs.mkdir(destinationPath, { recursive: true })
        return
    }

    if (event !== 'add' && event !== 'change') {
        return
    }

    await fs.mkdir(path.dirname(destinationPath), { recursive: true })
    await fs.copyFile(sourcePath, destinationPath)
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
