import fs from 'node:fs/promises'
import path from 'node:path'

const updateFileName = '__wx_hmr__/update.js'

export class WxPatchJournal {
    private readonly outDir: string
    private patches: string[] = []
    private bytes = 0

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
        return this.bytes
    }

    reset(): Promise<void> {
        this.patches = []
        this.bytes = 0
        return this.write(`globalThis.__VITE_PLUGIN_TARO_WX__.fullBuild = ${Date.now()};\n`)
    }

    append(code: string): Promise<void> {
        this.patches.push(code)
        this.bytes += Buffer.byteLength(code)
        return this.write(renderJournal(this.patches))
    }

    private async write(source: string): Promise<void> {
        const file = path.join(this.outDir, updateFileName)
        await fs.mkdir(path.dirname(file), { recursive: true })
        const temporaryFile = `${file}.tmp`
        await fs.writeFile(temporaryFile, source)
        await fs.rename(temporaryFile, file)
    }
}

function renderJournal(patches: string[]): string {
    const latestVersion = patches.length
    const updates = patches
        .map((code, index) => {
            const version = index + 1
            return `if (bridge.version < ${version}) {\n${code}\nbridge.version = ${version};\n}`
        })
        .join('\n')

    return `(() => {
    const bridge = globalThis.__VITE_PLUGIN_TARO_WX__;
    const applyUpdates = () => {
        if (bridge.version >= ${latestVersion}) return;
        bridge.beginUpdate?.();
        try {
${indent(updates, 12)}
        } finally {
            bridge.endUpdate?.();
        }
    };
    if (globalThis.__rolldown_runtime__ && bridge.ready) applyUpdates();
    else bridge.pendingUpdate = applyUpdates;
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
