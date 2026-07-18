import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ResolvedConfig, Rolldown } from 'vite'

export const controlFileName = 'vpt-hmr/control.js'
export const updateFileName = 'vpt-hmr/update.js'

/** File shape passed to Vite's private bundled-development output store. */
export type WxDevelopmentOutput = Array<Rolldown.OutputAsset | Rolldown.OutputChunk>

type WxDevelopmentFile = {
    fileName: string
    source: string | Uint8Array
}

/** Queues one DevEngine callback for physical writing. */
export function writeWxDevelopmentOutput({
    config,
    outDir,
    output,
    pageStyleFiles,
    previousWrite,
    clearOutput
}: {
    config: ResolvedConfig
    outDir: string
    output: WxDevelopmentOutput
    pageStyleFiles: ReadonlySet<string>
    previousWrite: Promise<void>
    clearOutput: boolean
}): { complete: boolean; done: Promise<void> } {
    const complete = output.some((file) => validateFileName(file.fileName) === 'app.js')

    return {
        complete,
        done: previousWrite.then(async () => {
            const files = new Map<string, string | Uint8Array>()
            if (complete) {
                for (const file of await readPublicFiles(config.publicDir)) files.set(file.fileName, file.source)
            }
            for (const file of output) {
                const fileName = getDevelopmentFileName(file, pageStyleFiles)
                files.set(fileName, file.type === 'chunk' ? file.code : file.source)
            }
            if (complete) {
                for (const file of createDevelopmentFiles()) files.set(file.fileName, file.source)
            }

            if (complete && clearOutput) await fs.rm(outDir, { recursive: true, force: true })
            await writeFilesAtomically(outDir, files)
        })
    }
}

function getDevelopmentFileName(file: WxDevelopmentOutput[number], pageStyleFiles: ReadonlySet<string>): string {
    const fileName = validateFileName(file.fileName)
    // The Tailwind adapter assigns its global asset a source-relative wxss filename after the configured asset callback.
    // CSS splitting is disabled, and Page styles are exact companions, so every other CSS/WXSS asset is app.wxss.
    return file.type === 'asset' &&
        (fileName.endsWith('.css') || (fileName.endsWith('.wxss') && !pageStyleFiles.has(fileName)))
        ? 'app.wxss'
        : fileName
}

function createDevelopmentFiles(): WxDevelopmentFile[] {
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

async function readPublicFiles(publicDir: string): Promise<WxDevelopmentFile[]> {
    if (!publicDir) return []

    try {
        const files: WxDevelopmentFile[] = []
        await collectPublicFiles(publicDir, '', files)
        return files
    } catch (error) {
        if (isMissingFileError(error)) return []
        throw error
    }
}

async function collectPublicFiles(
    directory: string,
    relativeDirectory: string,
    files: WxDevelopmentFile[]
): Promise<void> {
    const entries = await fs.readdir(path.join(directory, relativeDirectory), { withFileTypes: true })
    await Promise.all(
        entries.map(async (entry) => {
            const relativePath = path.posix.join(relativeDirectory.replaceAll('\\', '/'), entry.name)
            if (entry.isDirectory()) {
                await collectPublicFiles(directory, relativePath, files)
            } else if (entry.isFile()) {
                files.push({
                    fileName: validateFileName(relativePath),
                    source: await fs.readFile(path.join(directory, relativePath))
                })
            }
        })
    )
}

/** Writes every temporary sibling before renaming any file, minimizing partially prepared DevTools revisions. */
async function writeFilesAtomically(outDir: string, files: ReadonlyMap<string, string | Uint8Array>): Promise<void> {
    const nonce = crypto.randomUUID()
    const staged: Array<{ temporaryPath: string; destinationPath: string }> = []

    try {
        for (const [fileName, source] of files) {
            const destinationPath = path.join(outDir, fileName)
            const temporaryPath = `${destinationPath}.${nonce}.tmp`
            await fs.mkdir(path.dirname(destinationPath), { recursive: true })
            await fs.writeFile(temporaryPath, source)
            staged.push({ temporaryPath, destinationPath })
        }
        for (const file of staged) await fs.rename(file.temporaryPath, file.destinationPath)
    } catch (error) {
        await Promise.all(staged.map((file) => fs.rm(file.temporaryPath, { force: true })))
        throw error
    }
}

function validateFileName(fileName: string): string {
    const normalized = fileName.replaceAll('\\', '/')
    if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) {
        throw new Error(`wx output file escapes outDir: ${fileName}`)
    }
    return normalized
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
