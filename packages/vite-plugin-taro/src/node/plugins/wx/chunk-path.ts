import path from 'node:path'

/** Physical directory in which Rolldown writes generated JavaScript chunks inside each native package. */
export const generatedChunkDirectory = 'assets'

/** Projects one Rolldown-owned physical candidate path into the package-neutral SystemJS identity. */
export function toLogicalChunkId(physicalChunkId: string): string {
    return path.posix.relative(generatedChunkDirectory, physicalChunkId)
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
