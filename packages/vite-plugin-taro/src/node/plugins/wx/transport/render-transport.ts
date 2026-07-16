import path from 'node:path'
import { chunkIdToModuleUrl } from './module-url.ts'
import { transportFileName } from './transport.ts'

/** Renders literal native loaders for final chunks. */
export function renderTransport(chunkIds: readonly string[]): string {
    const capsuleCases = [...chunkIds]
        .sort()
        .map((chunkId) => {
            const requirePath = toNativeRequirePath(transportFileName, chunkId)
            return `        case ${JSON.stringify(chunkIdToModuleUrl(chunkId))}:
            return require(${JSON.stringify(requirePath)})`
        })
        .join('\n')

    return `'use strict'

/** Loads one capsule through native require. */
function instantiate(id) {
    switch (id) {
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
