import { randomUUID } from 'node:crypto'
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
 * Renders the cumulative patch suffix as inert CommonJS data.
 *
 * DevTools re-executes the Page because this dependency changed. The Page entry passes the exported payload to the persistent
 * App runtime synchronously before importing its capsule, keeping delivery explicit and leaving this file free of side effects.
 */
export function renderHmrPatches(buildId: string, patches: readonly PatchUpdate[]): string {
    if (patches.length === 0) {
        throw new Error('Cannot render an empty WX patch range.')
    }

    const rendered = patches.map(
        (patch) =>
            `{seq: ${patch.seq}, changedIds: ${JSON.stringify(patch.changedIds)}, factory: () => {\n${patch.code}\n}}`
    )

    return `module.exports = {buildId: ${JSON.stringify(buildId)}, patches: [${rendered.join(',')}]};\n`
}

/** Atomically publishes one physical HMR module so DevTools can observe only complete JavaScript generations. */
export async function writeHmrFile(outDir: string, fileName: string, source: string): Promise<void> {
    const filePath = path.join(outDir, fileName)
    const directory = path.dirname(filePath)

    await fs.mkdir(directory, { recursive: true })

    const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.txt`)

    try {
        // DevTools ignores the temporary .txt file; keeping it beside the destination guarantees a same-filesystem rename.
        await fs.writeFile(temporaryPath, source)
        await fs.rename(temporaryPath, filePath)
    } finally {
        // rename removes the source path on success; force cleanup covers interrupted writes and failed replacements.
        await fs.rm(temporaryPath, { force: true })
    }
}
