import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

// Keep both identities stable: native App/Page banners contain literal require() paths and WeChat DevTools observes
// update.js as the executable hot-update boundary.
export const controlFileName = 'vpt-hmr/control.js'
export const updateFileName = 'vpt-hmr/update.js'

/**
 * Performs the small part of Vite's prepare-out-dir behavior needed by physical bundled development.
 *
 * Rolldown owns every generated file because the DevEngine runs with skipWrite:false. This helper runs only before the
 * engine starts: it optionally removes the previous project, creates the destination, and copies public files that are
 * outside Rolldown's bundle graph.
 */
export async function initializeWxDevelopmentOutput({
    outDir,
    publicDir,
    emptyOutDir
}: {
    outDir: string
    publicDir: string
    emptyOutDir: boolean
}): Promise<void> {
    if (emptyOutDir) await fs.rm(outDir, { recursive: true, force: true })
    await fs.mkdir(outDir, { recursive: true })
    if (!publicDir) return

    try {
        await fs.cp(publicDir, outDir, { recursive: true, force: true })
    } catch (error) {
        // Vite permits a configured/default public directory that does not exist. Match that behavior while preserving
        // every other filesystem failure, including permissions and invalid destinations.
        if (!isMissingFileError(error)) throw error
    }
}

/**
 * Mirrors one Vite watcher event from publicDir into the physical Mini Program directory.
 *
 * Copying only the changed path preserves generated files and makes deletion semantics explicit; no rebuild or complete
 * public-directory recopy is needed after startup.
 */
export async function syncWxPublicFile(event: string, sourcePath: string, destinationPath: string): Promise<void> {
    if (event === 'unlink' || event === 'unlinkDir') {
        // Recursive removal is reserved for an actual directory event so a malformed file event cannot remove siblings.
        await fs.rm(destinationPath, { recursive: event === 'unlinkDir', force: true })
        return
    }
    if (event === 'addDir') {
        await fs.mkdir(destinationPath, { recursive: true })
        return
    }
    if (event !== 'add' && event !== 'change') return

    await fs.mkdir(path.dirname(destinationPath), { recursive: true })
    await fs.copyFile(sourcePath, destinationPath)
}

/**
 * Creates the two development assets emitted by the normal initial generateBundle lifecycle.
 *
 * control.js is synchronous CommonJS because app.js requires it before any capsule executes. The endpoint and token are
 * placeholders for the metadata protocol. update.js is valid but inert until the future publisher atomically replaces
 * it with one native executable patch.
 */
export function createWxDevelopmentFiles(): Array<{
    type: 'asset'
    fileName: string
    source: string
}> {
    return [
        {
            type: 'asset',
            fileName: controlFileName,
            // A cold materialization receives a fresh identity; a runtime must never accept an update for another heap.
            source: `module.exports = Object.freeze(${JSON.stringify({
                buildId: crypto.randomUUID(),
                endpoint: '',
                token: ''
            })});\n`
        },
        {
            type: 'asset',
            fileName: updateFileName,
            source: 'module.exports = undefined;\n'
        }
    ]
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
