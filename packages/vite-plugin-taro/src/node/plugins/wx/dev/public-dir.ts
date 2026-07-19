import fs from 'node:fs/promises'

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

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
