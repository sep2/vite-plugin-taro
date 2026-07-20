import fs from 'node:fs/promises'
import path from 'node:path'
import type { PatchProjection } from '../topology.ts'

export const hmrInfoFileName = 'hmr/info.js'
export const hmrPatchesFileName = 'hmr/patches.js'

/** Immutable App metadata for the current complete physical build. */
export type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
    token: string
}>

/** Renders the synchronous CommonJS metadata module loaded by the App banner. */
export function renderHmrInfo(info: HmrInfo): string {
    return `module.exports = Object.freeze(${JSON.stringify(info)});\n`
}

/** Provides a valid dependency before the host has a missing patch range to publish. */
export function renderInitialHmrPatches(): string {
    return 'module.exports = undefined;\n'
}

/**
 * Renders a passive physical patch delivery module.
 *
 * DevTools re-executes the Page because this file changed. The module captures the literal Rolldown factories in the
 * persistent App runtime but does not execute them; the runtime reconciles only after that Page evaluation returns.
 */
export function renderHmrPatches(projection: PatchProjection): string {
    if (
        !Number.isSafeInteger(projection.fromVersion) ||
        !Number.isSafeInteger(projection.targetVersion) ||
        projection.targetVersion <= projection.fromVersion ||
        projection.patches.length !== projection.targetVersion - projection.fromVersion
    ) {
        throw new Error('Cannot render an empty or non-contiguous WX patch range.')
    }

    const metadata = {
        buildId: projection.buildId,
        fromVersion: projection.fromVersion,
        targetVersion: projection.targetVersion
    }
    const patchSource = projection.patches.map((patch) => patch.code).join('\n')

    return `const __rolldown_runtime__ = global.__rolldown_runtime__;\nmodule.exports = __rolldown_runtime__.storePatches(${JSON.stringify(metadata)}, () => {\n${indent(patchSource, 4)}\n});\n`
}

/**
 * Publishes through one complete close-write event.
 *
 * DevTools interprets a temporary-file rename as a wider App change, so ordinary patch delivery intentionally uses
 * direct writeFile rather than the usual atomic rename pattern. The topology still treats the completed close-write as
 * one indivisible physical publication.
 */
export async function writeHmrFile(outDir: string, fileName: string, source: string): Promise<void> {
    const filePath = path.join(outDir, fileName)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, source)
}

function indent(value: string, spaces: number): string {
    const prefix = ' '.repeat(spaces)
    return value
        .split('\n')
        .map((line) => `${prefix}${line}`)
        .join('\n')
}
