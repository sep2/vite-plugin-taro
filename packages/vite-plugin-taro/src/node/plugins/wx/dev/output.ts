import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ResolvedConfig, Rolldown } from 'vite'

export const controlFileName = 'vpt-hmr/control.js'
export const updateFileName = 'vpt-hmr/update.js'

/** File shape passed to Vite's private bundled-development output store. */
export type WxDevelopmentOutput = Array<Rolldown.OutputAsset | Rolldown.OutputChunk>

export type WxDevelopmentFile = {
    fileName: string
    source: string | Uint8Array
}

/** Converts one DevEngine callback into immutable physical output. */
export function createWxDevelopmentOutput(
    output: WxDevelopmentOutput,
    pageStyleFiles: ReadonlySet<string>
): { complete: boolean; files: readonly WxDevelopmentFile[] } {
    const files = output.map((file) => {
        const fileName = validateFileName(file.fileName)

        return {
            // The Tailwind adapter assigns its global asset a source-relative wxss filename after the configured asset
            // callback. CSS splitting is disabled, and Page styles are exact companions, so every other CSS/WXSS asset
            // is the Mini Program's root stylesheet.
            fileName:
                file.type === 'asset' &&
                (fileName.endsWith('.css') || (fileName.endsWith('.wxss') && !pageStyleFiles.has(fileName)))
                    ? 'app.wxss'
                    : fileName,
            source: file.type === 'chunk' ? file.code : copySource(file.source)
        }
    })
    const complete = files.some((file) => file.fileName === 'app.js')

    return {
        complete,
        files: complete ? [...files, ...createDevelopmentFiles()] : files
    }
}

/** Writes one immutable output revision. Unchanged DevEngine assets remain in place between complete callbacks. */
export async function writeWxDevelopmentOutput({
    config,
    outDir,
    files: output,
    complete,
    clearOutput
}: {
    config: ResolvedConfig
    outDir: string
    files: readonly WxDevelopmentFile[]
    complete: boolean
    clearOutput: boolean
}): Promise<void> {
    const files = new Map<string, string | Uint8Array>()
    if (complete) {
        for (const file of await readPublicFiles(config.publicDir)) files.set(file.fileName, file.source)
    }
    for (const file of output) files.set(validateFileName(file.fileName), file.source)

    if (clearOutput) await fs.rm(outDir, { recursive: true, force: true })
    await writeFilesAtomically(outDir, files)
}

function copySource(source: string | Uint8Array): string | Uint8Array {
    return typeof source === 'string' ? source : source.slice()
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
