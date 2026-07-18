import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ResolvedConfig, Rolldown } from 'vite'

export const controlFileName = 'vpt-hmr/control.js'
export const updateFileName = 'vpt-hmr/update.js'

/** File shape passed to Vite's private bundled-development output store. */
export type WxDevelopmentOutput = Array<Rolldown.OutputAsset | Rolldown.OutputChunk>

type MaterializedFile = {
    fileName: string
    source: string | Uint8Array
}

type OutputRevision = {
    files: Map<string, string | Uint8Array>
    volatileFiles: Set<string>
    manifest: Set<string>
    initialOutputCommitted: boolean
}

/** Owns the accumulated DevEngine revision and all writes to the physical Mini Program directory. */
export class WxDevelopmentMaterializer {
    readonly outDir: string
    private readonly config: ResolvedConfig
    private readonly pageStyleFiles: ReadonlySet<string>
    private readonly revision: OutputRevision = {
        files: new Map(),
        volatileFiles: new Set(),
        manifest: new Set(),
        initialOutputCommitted: false
    }
    private writeTail: Promise<void> = Promise.resolve()
    private closed = false

    constructor(config: ResolvedConfig, pagePaths: readonly string[]) {
        this.config = config
        this.outDir = path.resolve(config.root, config.build.outDir)
        this.pageStyleFiles = new Set(pagePaths.map((pagePath) => `${pagePath}.wxss`))
    }

    /** Merges one DevEngine callback into the current revision and queues its physical commit. */
    write(output: WxDevelopmentOutput): { complete: boolean; done: Promise<void> } {
        const files = snapshotOutput(output, this.pageStyleFiles)
        const complete = files.some((file) => file.fileName === 'app.js')

        if (complete) {
            // DevEngine full rebuilds contain every chunk but omit unchanged generateBundle assets. Replace only the
            // volatile JavaScript revision while retaining JSON/WXML/WXSS and imported assets from earlier callbacks.
            for (const fileName of this.revision.volatileFiles) this.revision.files.delete(fileName)
            this.revision.volatileFiles.clear()
            for (const fileName of getVolatileFileNames(output)) this.revision.volatileFiles.add(fileName)
            addDevelopmentFiles(files)
        }

        for (const file of files) this.revision.files.set(file.fileName, file.source)
        const outputRevision = complete ? mapToFiles(this.revision.files) : files
        const done = this.enqueue(() => this.materialize(outputRevision, complete))
        return { complete, done }
    }

    async close(): Promise<void> {
        this.closed = true
        await this.writeTail
    }

    async waitForIdle(): Promise<void> {
        await this.writeTail
    }

    private enqueue(task: () => Promise<void>): Promise<void> {
        const write = this.writeTail.then(task, task)
        this.writeTail = write.catch((error: unknown) => {
            const normalizedError = error instanceof Error ? error : new Error(String(error))
            this.config.logger.error('[vite-plugin-taro] wx output write failed', { error: normalizedError })
        })
        return write
    }

    private async materialize(output: readonly MaterializedFile[], complete: boolean): Promise<void> {
        if (this.closed) return

        const files = new Map<string, string | Uint8Array>()
        if (complete) {
            for (const file of await readPublicFiles(this.config.publicDir)) files.set(file.fileName, file.source)
        }
        for (const file of output) files.set(validateFileName(file.fileName), file.source)

        if (complete && !this.revision.initialOutputCommitted && this.config.build.emptyOutDir !== false) {
            await fs.rm(this.outDir, { recursive: true, force: true })
        }

        await writeFilesAtomically(this.outDir, files)

        if (complete) {
            for (const staleFile of this.revision.manifest.difference(new Set(files.keys()))) {
                await fs.rm(path.join(this.outDir, staleFile), { force: true })
            }
            this.revision.manifest = new Set(files.keys())
            this.revision.initialOutputCommitted = true
        }
    }
}

function snapshotOutput(output: WxDevelopmentOutput, pageStyleFiles: ReadonlySet<string>): MaterializedFile[] {
    return output.map((file) => {
        const fileName = validateFileName(file.fileName)

        return {
            // The Tailwind Vite adapter assigns its global asset a source-relative wxss filename after Rolldown's asset
            // callback has run. CSS splitting is disabled, and native Page styles are known exact companion files, so
            // every other CSS/WXSS output is the one global stylesheet required at the Mini Program root.
            fileName:
                file.type === 'asset' &&
                (fileName.endsWith('.css') || (fileName.endsWith('.wxss') && !pageStyleFiles.has(fileName)))
                    ? 'app.wxss'
                    : fileName,
            source: file.type === 'chunk' ? file.code : copySource(file.source)
        }
    })
}

function getVolatileFileNames(output: WxDevelopmentOutput): string[] {
    return output
        .filter((file) => file.type === 'chunk' || file.fileName.endsWith('.js.map'))
        .map((file) => validateFileName(file.fileName))
}

function mapToFiles(files: ReadonlyMap<string, string | Uint8Array>): MaterializedFile[] {
    return [...files].map(([fileName, source]) => ({ fileName, source }))
}

function copySource(source: string | Uint8Array): string | Uint8Array {
    return typeof source === 'string' ? source : source.slice()
}

function addDevelopmentFiles(files: MaterializedFile[]): void {
    const buildId = crypto.randomUUID()
    files.push(
        {
            fileName: controlFileName,
            source: `module.exports = Object.freeze(${JSON.stringify({ buildId, endpoint: '', token: '' })});\n`
        },
        {
            fileName: updateFileName,
            source: 'module.exports = undefined;\n'
        }
    )
}

async function readPublicFiles(publicDir: string): Promise<MaterializedFile[]> {
    if (!publicDir) return []

    try {
        const files: MaterializedFile[] = []
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
    files: MaterializedFile[]
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
