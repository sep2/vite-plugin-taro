import fs from 'node:fs/promises'
import path from 'node:path'

const updateFileName = '__wx_hmr__/update.js'

export class WxPatchJournal {
    private readonly outDir: string
    private patches: string[] = []
    private writeQueue = Promise.resolve()

    constructor(outDir: string) {
        this.outDir = outDir
    }

    get fileName(): string {
        return updateFileName
    }

    get length(): number {
        return this.patches.length
    }

    get size(): number {
        return this.patches.reduce((total, patch) => total + Buffer.byteLength(patch), 0)
    }

    reset(): Promise<void> {
        this.patches = []
        return this.write(`globalThis.__WX_FULL_BUILD__ = ${Date.now()};\n`)
    }

    append(code: string): Promise<void> {
        this.patches.push(code)
        return this.write(renderJournal(this.patches))
    }

    close(): Promise<void> {
        return this.writeQueue
    }

    private write(source: string): Promise<void> {
        const file = path.join(this.outDir, updateFileName)
        this.writeQueue = this.writeQueue.then(async () => {
            await fs.mkdir(path.dirname(file), { recursive: true })
            const temporaryFile = `${file}.tmp`
            await fs.writeFile(temporaryFile, source)
            await fs.rename(temporaryFile, file)
        })
        return this.writeQueue
    }
}

function renderJournal(patches: string[]): string {
    const latestVersion = patches.length
    const updates = patches
        .map((code, index) => {
            const version = index + 1
            return `if (globalThis.__WX_HMR_VERSION__ < ${version}) {\n${code}\nglobalThis.__WX_HMR_VERSION__ = ${version};\n}`
        })
        .join('\n')

    return `globalThis.__WX_HMR_VERSION__ ??= 0;
(() => {
    const applyUpdates = () => {
        if (globalThis.__WX_HMR_VERSION__ >= ${latestVersion}) return;
        globalThis.__WX_BUNDLED_HMR_BEGIN__?.();
        try {
${indent(updates, 12)}
        } finally {
            globalThis.__WX_BUNDLED_HMR_END__?.();
        }
    };
    if (globalThis.__rolldown_runtime__ && globalThis.__WX_BUNDLED_RUNTIME_READY__) applyUpdates();
    else globalThis.__WX_PENDING_BUNDLED_HMR__ = applyUpdates;
})();
`
}

function indent(value: string, spaces: number): string {
    const prefix = ' '.repeat(spaces)
    return value
        .split('\n')
        .map((line) => `${prefix}${line}`)
        .join('\n')
}
