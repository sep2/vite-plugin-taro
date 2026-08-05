import fs from 'node:fs/promises'
import path from 'node:path'
import type { BindingClientHmrUpdate } from 'rolldown/experimental'

export const hmrInfoFileName = 'hmr/info.js'
export const hmrPatchesFileName = 'hmr/patches.js'

/** Report endpoint path served by the wx dev control edge. */
export const hmrControlPath = '/__vpt_hmr__'

/** Immutable App metadata for the current complete physical build. */
export type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
}>

/** The Patch variant of Rolldown's per-client HMR update, admitted into the patch history. */
export type PatchUpdate = Extract<BindingClientHmrUpdate['update'], { type: 'Patch' }>

/** Renders the synchronous CommonJS metadata module loaded by the runtime chunk. */
export function renderHmrInfo(info: HmrInfo): string {
    return `module.exports = Object.freeze(${JSON.stringify(info)});\n`
}

/** Provides a valid dependency before the host has a patch range to publish. */
export function renderInitialHmrPatches(): string {
    return 'module.exports = undefined;\n'
}

/**
 * Renders the missing patch suffix as a passive physical delivery module.
 *
 * DevTools re-executes the Page because this file changed. The module only stores the literal
 * Rolldown factories in the persistent App runtime; storePatches applies them synchronously,
 * so the Page's imports below the require resolve against the freshly registered modules.
 */
export function renderHmrPatches(buildId: string, patches: readonly PatchUpdate[]): string {
    if (patches.length === 0) {
        throw new Error('Cannot render an empty WX patch range.')
    }

    const rendered = patches.map(
        (patch) =>
            `{seq: ${patch.seq}, changedIds: ${JSON.stringify(patch.changedIds)}, factory: () => {\n${patch.code}\n}}`
    )

    return `__rolldown_runtime__.storePatches({buildId: ${JSON.stringify(buildId)}, patches: [${rendered.join(',')}]});\n`
}

/** Publishes one physical HMR file (direct write; atomic rename is reserved for later analysis). */
export async function writeHmrFile(outDir: string, fileName: string, source: string): Promise<void> {
    const filePath = path.join(outDir, fileName)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, source)
}
