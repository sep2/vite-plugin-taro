import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Rolldown } from 'vite'

export const controlFileName = 'vpt-hmr/control.js'
export const updateFileName = 'vpt-hmr/update.js'

/** File shape passed to Vite's private bundled-development output store. */
export type WxDevelopmentOutput = Array<Rolldown.OutputAsset | Rolldown.OutputChunk>

/** Clears the previous session and copies public files before the first generated output is committed. */
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
        if (!isMissingFileError(error)) throw error
    }
}

/** Mirrors one public-directory watcher event into the physical Mini Program directory. */
export async function syncWxPublicFile(event: string, sourcePath: string, destinationPath: string): Promise<void> {
    if (event === 'unlink' || event === 'unlinkDir') {
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

/** Queues one DevEngine callback behind the previous physical write. */
export function writeWxDevelopmentOutput({
    outDir,
    output,
    previousWrite
}: {
    outDir: string
    output: WxDevelopmentOutput
    previousWrite: Promise<void>
}): { complete: boolean; done: Promise<void> } {
    const complete = output.some((file) => file.fileName === 'app.js')

    return {
        complete,
        done: previousWrite.then(async () => {
            const files = output.map((file) => ({
                fileName: file.fileName,
                source: file.type === 'chunk' ? file.code : file.source
            }))
            if (complete) files.push(...createDevelopmentFiles())

            const update = files.find((file) => file.fileName === updateFileName)
            await Promise.all(
                files
                    .filter((file) => file !== update)
                    .map((file) =>
                        file.fileName === 'app.wxss'
                            ? writeFileAtomically(outDir, file.fileName, file.source)
                            : writeFile(outDir, file.fileName, file.source)
                    )
            )
            if (update) await writeFileAtomically(outDir, update.fileName, update.source)
        })
    }
}

function createDevelopmentFiles(): Array<{ fileName: string; source: string }> {
    const buildId = crypto.randomUUID()
    return [
        {
            fileName: controlFileName,
            source: `module.exports = Object.freeze(${JSON.stringify({ buildId, endpoint: '', token: '' })});\n`
        },
        {
            fileName: updateFileName,
            source: 'module.exports = undefined;\n'
        }
    ]
}

async function writeFile(outDir: string, fileName: string, source: string | Uint8Array): Promise<void> {
    const destinationPath = path.join(outDir, fileName)
    await fs.mkdir(path.dirname(destinationPath), { recursive: true })
    await fs.writeFile(destinationPath, source)
}

async function writeFileAtomically(outDir: string, fileName: string, source: string | Uint8Array): Promise<void> {
    const destinationPath = path.join(outDir, fileName)
    const temporaryPath = `${destinationPath}.${crypto.randomUUID()}.tmp`
    await fs.mkdir(path.dirname(destinationPath), { recursive: true })

    try {
        await fs.writeFile(temporaryPath, source)
        await fs.rename(temporaryPath, destinationPath)
    } finally {
        await fs.rm(temporaryPath, { force: true })
    }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
