import fs from 'node:fs/promises'
import path from 'node:path'

export const hmrInfoFileName = 'hmr/info.js'
export const hmrPatchesFileName = 'hmr/patches.js'

/** Report endpoint path served by the wx dev control edge. */
export const hmrControlPath = '/__vpt_hmr__'

/** Immutable App metadata for the current complete physical build. */
export type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
}>

/** Renders the synchronous CommonJS metadata module loaded by the runtime chunk. */
export function renderHmrInfo(info: HmrInfo): string {
    return `module.exports = Object.freeze(${JSON.stringify(info)});\n`
}

/** Provides a valid dependency before the host has a patch range to publish. */
export function renderInitialHmrPatches(): string {
    return 'module.exports = undefined;\n'
}

/** Publishes one physical HMR file (direct write; atomic rename is reserved for later analysis). */
export async function writeHmrFile(outDir: string, fileName: string, source: string): Promise<void> {
    const filePath = path.join(outDir, fileName)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, source)
}
