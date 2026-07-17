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
    // transport.js is emitted at the project root, so every native require must be relative to that file.
    const bootstrapRequirePath = toNativeRequirePath(transportFileName, bootstrapChunkId)

    // Generate a closed literal switch instead of computing paths at runtime. This keeps every dependency visible to the
    // WeChat compiler while preserving the canonical vpt:/ IDs used by SystemJS for resolution and module caching.
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
 * SystemJS calls this transport instead of fetching JavaScript through a browser network API.
 * Application capsule files already export [dependencies, declaration], so their cases return native require directly.
 * Every require argument is generated as a string literal for the WeChat compiler's dependency analysis.
 */

/**
 * Exposes cached native CommonJS exports as an inert System registration.
 *
 * Bootstrap cannot be a capsule because App, Page, and Component shells require it synchronously. Vite's preload helper
 * is also imported by application capsules, so SystemJS needs a namespace for the same native module. The native shell
 * executes bootstrap before its first System.import; require therefore reads the completed native module cache, while
 * this bridge only adapts its exports to System.register's [dependencies, declaration] protocol.
 */
function registerNativeModule(namespace) {
    return [
        // Native bootstrap has already resolved its own dependencies before SystemJS observes it.
        [],
        function (exportBinding) {
            return {
                // Publishing the object exposes every enumerable CommonJS binding in the SystemJS namespace.
                execute: function () {
                    exportBinding(namespace)
                }
            }
        }
    ]
}

/**
 * Implements SystemJS's instantiate hook.
 * A case returns either an existing capsule registration or the synthetic registration for native bootstrap.
 */
function instantiate(id) {
    switch (id) {
        // Application capsules retain Vite's preload import. Native require returns the bootstrap namespace from cache.
        case ${JSON.stringify(chunkIdToModuleUrl(bootstrapChunkId))}:
            return registerNativeModule(require(${JSON.stringify(bootstrapRequirePath)}))
${capsuleCases}
        // Reject unknown IDs instead of allowing a computed native require outside the finalized Rolldown bundle.
        default:
            throw new Error('Unknown System module: ' + id)
    }
}

// Native bootstrap installs this function as System.instantiate after loading SystemJS.
module.exports = { instantiate }
`
}

/** Converts one finalized output path to a literal require path relative to root-level transport.js. */
function toNativeRequirePath(fromFileName: string, toFileName: string): string {
    const relativePath = path.posix.relative(path.posix.dirname(fromFileName), toFileName)
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}
