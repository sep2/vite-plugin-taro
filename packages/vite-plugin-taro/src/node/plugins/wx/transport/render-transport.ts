import path from 'node:path'
import { transportFileName } from './constant.ts'
import { chunkIdToModuleUrl } from './module-url.ts'

/** Renders literal native loaders for capsules and the native bootstrap bridge. */
export function renderTransport({
    bootstrapChunkId,
    capsuleChunkIds
}: {
    bootstrapChunkId: string
    capsuleChunkIds: readonly string[]
}): string {
    const bootstrapRequirePath = toNativeRequirePath(transportFileName, bootstrapChunkId)

    const capsuleCases = [...capsuleChunkIds]
        .sort()
        .map((chunkId) => {
            const requirePath = toNativeRequirePath(transportFileName, chunkId)
            return `        case ${JSON.stringify(chunkIdToModuleUrl(chunkId))}:
            return require(${JSON.stringify(requirePath)})`
        })
        .join('\n')

    return `'use strict'

/**
 * Exposes cached native CommonJS exports as an inert System registration.
 * The native shell executes bootstrap before its first System.import, so this bridge never evaluates bootstrap twice.
 */
function registerNativeModule(namespace) {
    return [[], function (exportBinding) {
        return {
            execute: function () {
                exportBinding(namespace)
            }
        }
    }]
}

/** Loads one application capsule or the native bootstrap bridge. */
function instantiate(id) {
    switch (id) {
        // Application capsules retain Vite's preload import. Native require returns the bootstrap namespace from cache.
        case ${JSON.stringify(chunkIdToModuleUrl(bootstrapChunkId))}:
            return registerNativeModule(require(${JSON.stringify(bootstrapRequirePath)}))
${capsuleCases}
        default:
            throw new Error('Unknown System module: ' + id)
    }
}

module.exports = { instantiate }
`
}

/** Creates a require path relative to the transport. */
function toNativeRequirePath(fromFileName: string, toFileName: string): string {
    const relativePath = path.posix.relative(path.posix.dirname(fromFileName), toFileName)
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}
