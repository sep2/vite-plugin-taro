import path from 'node:path'

/** Uses package-relative paths as logical IDs so source groups and runtime chunks share one namespace. */
export function toLogicalChunkId(physicalChunkId: string): string {
    return path.posix.normalize(physicalChunkId)
}

/** Resolves one relative Rolldown-generated import to its preliminary physical chunk path. */
export function resolvePhysicalChunkReference(importerChunkId: string, reference: string): string {
    if (!reference.startsWith('./') && !reference.startsWith('../')) {
        throw new Error(`Expected a relative chunk reference in ${importerChunkId}: ${reference}`)
    }
    return path.posix.join(path.posix.dirname(importerChunkId), reference)
}

/** Projects one relative Rolldown-generated import into its package-neutral SystemJS identity. */
export function resolveLogicalChunkReference(importerChunkId: string, reference: string): string {
    return toLogicalChunkId(resolvePhysicalChunkReference(importerChunkId, reference))
}
