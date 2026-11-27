import { createHash } from 'node:crypto'
import type { Rolldown } from 'vite'
import type { MiniGeneratedSubpackage } from '../mini-contract.ts'

const generatedSubpackageRootPrefix = 'sub/p_'

/** Identifies a subpackage by its physical output root. */
export type SubpackageLocation = {
    /** Discriminates subpackages from main. */
    kind: 'subpackage'
    /** Native subpackage root relative to the Mini Program output directory. */
    root: string
}

/** Physical package ownership for one final Rolldown chunk. */
export type PackageLocation = { kind: 'main' } | SubpackageLocation

/** One generated code package retained by the final output graph. */
export type GeneratedSubpackage = MiniGeneratedSubpackage

/** Immutable ownership and materialization operations for one complete final-chunk graph. */
export type Placement = Readonly<{
    getPackageLocation(chunk: Rolldown.RenderedChunk | Rolldown.OutputChunk): PackageLocation
    /** Resolves a rendered chunk or its exact entry module ID to its planned physical path. */
    getPhysicalChunkId(chunk: Rolldown.RenderedChunk | string): string
    finalize(bundle: Rolldown.OutputBundle): readonly GeneratedSubpackage[]
}>

/** Shared location for chunks owned by the main package. */
const mainPackage = { kind: 'main' } as const

/** One named package and its preliminary entry chunk IDs. */
type NamedSubpackage = Readonly<{ root: string; entries: readonly string[] }>

type PlaceableChunk = {
    chunkId: string
    estimatedBytes: number
    transitions: ReadonlySet<number>
}

type ChunkBin = {
    chunkIds: string[]
    estimatedBytes: number
    transitions: Set<number>
}

type BinCandidate = {
    bin: ChunkBin
    overlap: number
    remainingBytes: number
}

type PackedSubpackage = SubpackageLocation & {
    chunkIds: readonly string[]
}

/**
 * Applies Load-Transition Hypergraph Partitioning to Rolldown's final preliminary chunk graph:
 *
 * 1. Sort preliminary filenames to remove callback and object-enumeration order from every later decision.
 * 2. Pin entry closures to their package; dependencies reached from multiple packages must be readable from main.
 * 3. Treat each dynamic-import edge as one load transition; the target's static closure is that transition's hyperedge.
 *    Nested dynamic edges remain separate transitions rather than being folded into the parent closure.
 * 4. Index every lazy chunk by all transitions requiring it. Shared chunks therefore carry global demand rather than being
 *    assigned according to the first source module or dynamic root that happens to visit them.
 * 5. Order chunks by transition demand, estimated emitted bytes, then preliminary filename. Place each chunk once into the
 *    fitting bin with maximum transition overlap, using best-fit remaining capacity only as a tie-breaker.
 * 6. Hash each bin's sorted preliminary filenames into a deterministic physical package root and return unique ownership.
 *
 * Analysis costs the sum of transition static-closure traversals. Packing scans fitting bins and intersects sparse
 * transition sets; its worst case is O(CBT), while practical graphs have few bins and sparse transition membership.
 */
export function createPlacement({
    automaticSubpackages,
    namedSubpackages,
    chunks,
    planningBudgetBytes,
    getAdditionalModuleBytes
}: {
    automaticSubpackages: boolean
    /** Unlisted entries belong to the main package. */
    namedSubpackages: readonly NamedSubpackage[]
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>
    planningBudgetBytes: number
    getAdditionalModuleBytes(moduleId: string): number
}): Placement {
    const chunkById = new Map(Object.entries(chunks).sort(([left], [right]) => left.localeCompare(right)))

    // Index entry identities once per immutable plan: O(C) construction and O(1) lookup without rescanning output chunks.
    // Shared chunks without a facade remain addressable by their rendered chunk object.
    const chunkByEntryModuleId = new Map(
        [...chunkById.values()].flatMap((chunk) =>
            chunk.facadeModuleId === null ? [] : [[chunk.facadeModuleId, chunk] as const]
        )
    )

    // Eager assignments are fixed before lazy packing; only unassigned chunks can enter generated packages.
    const locationByChunk =
        automaticSubpackages || namedSubpackages.length
            ? placeEntryClosures(chunkById, namedSubpackages)
            : new Map<string, PackageLocation>()
    // Only roots allocated by the packer need generated declarations.
    const generatedPackages = new Set<PackageLocation>()
    if (automaticSubpackages) {
        for (const subpackage of packLazyChunks(
            chunkById,
            locationByChunk,
            planningBudgetBytes,
            getAdditionalModuleBytes
        )) {
            generatedPackages.add(subpackage)
            for (const chunkId of subpackage.chunkIds) {
                locationByChunk.set(chunkId, subpackage)
            }
        }
    } else {
        for (const id of chunkById.keys()) {
            if (!locationByChunk.has(id)) {
                locationByChunk.set(id, mainPackage)
            }
        }
    }
    function getLocation(chunkId: string): PackageLocation {
        const location = locationByChunk.get(chunkId)
        if (!location) {
            throw new Error(`Mini Program placement is missing final chunk: ${chunkId}`)
        }
        return location
    }

    /** Resolves typed ownership from Rolldown's preliminary physical filename before or after finalization. */
    function getPackageLocation(chunk: Rolldown.RenderedChunk | Rolldown.OutputChunk): PackageLocation {
        return getLocation('preliminaryFileName' in chunk ? chunk.preliminaryFileName : chunk.fileName)
    }

    return {
        getPackageLocation: getPackageLocation,

        /** Adds the planned package root to a physical preliminary path without changing the chunk's SystemJS identity. */
        getPhysicalChunkId(chunk: Rolldown.RenderedChunk | string): string {
            const resolved = typeof chunk === 'string' ? chunkByEntryModuleId.get(chunk) : chunk
            if (!resolved) {
                throw new Error(`Mini Program placement is missing entry module: ${chunk}`)
            }
            const location = getPackageLocation(resolved)
            return location.kind === 'main' ? resolved.fileName : `${location.root}/${resolved.fileName}`
        },

        /** Assigns each final chunk's Rolldown-owned physical filename and declares typed owners that survived output. */
        finalize(bundle: Rolldown.OutputBundle): readonly GeneratedSubpackage[] {
            const outputChunks = Object.values(bundle).filter(
                (output): output is Rolldown.OutputChunk => output.type === 'chunk'
            )
            // This local mutable set deduplicates typed package owners that retain at least one final output chunk.
            const roots = new Set<string>()
            for (const chunk of outputChunks) {
                // OutputChunk.fileName contains the resolved content hash. preliminaryFileName preserves the exact physical
                // candidate with placeholders that identified this chunk when placement was created during renderChunk.
                const location = getLocation(chunk.preliminaryFileName)
                if (location.kind !== 'subpackage') {
                    continue
                }
                // OutputChunk is mutable in generateBundle. Assigning fileName makes Rolldown retain all chunk metadata and
                // write that same chunk at its physical package path; deleting bundle keys or re-emitting would lose identity.
                chunk.fileName = `${location.root}/${chunk.fileName}`
                if (generatedPackages.has(location)) {
                    roots.add(location.root)
                }
            }

            return [...roots].sort().map((root) => ({ root: root }))
        }
    }
}

/** Entries in one package share one traversal. Once two packages reach a chunk, its entire closure is in main. */
function placeEntryClosures(
    chunks: ReadonlyMap<string, Rolldown.RenderedChunk>,
    namedSubpackages: readonly NamedSubpackage[]
): Map<string, PackageLocation> {
    const namedEntries = new Set(namedSubpackages.values().flatMap(({ entries }) => entries))
    const mainEntries = chunks
        .entries()
        .filter(([id, chunk]) => chunk.isEntry && !namedEntries.has(id))
        .map(([id]) => id)
    // Main ownership is final, so later traversals can stop at an already shared chunk.
    const mainIds = collectStaticClosure(chunks, mainEntries, new Set<string>())
    const owners = new Map<string, PackageLocation>(mainIds.values().map((id) => [id, mainPackage]))
    for (const { root, entries } of namedSubpackages) {
        const location = { kind: 'subpackage', root } as const
        for (const id of collectStaticClosure(chunks, entries, mainIds)) {
            if (owners.has(id)) {
                mainIds.add(id)
                owners.set(id, mainPackage)
            } else {
                owners.set(id, location)
            }
        }
    }
    return owners
}

/** Pack chunks outside the pinned entry closures according to dynamic-import demand. */
function packLazyChunks(
    chunkById: ReadonlyMap<string, Rolldown.RenderedChunk>,
    locationByChunk: ReadonlyMap<string, PackageLocation>,
    planningBudgetBytes: number,
    getAdditionalModuleBytes: (moduleId: string) => number
): PackedSubpackage[] {
    const transitionsByChunk = collectTransitionsByChunk(chunkById, locationByChunk)
    const placeableChunks = [...chunkById]
        .filter(([chunkId]) => !locationByChunk.has(chunkId))
        .map(([chunkId, chunk]) => ({
            chunkId: chunkId,
            estimatedBytes:
                estimateChunkBytes(chunk) +
                chunk.moduleIds.reduce((bytes, moduleId) => bytes + getAdditionalModuleBytes(moduleId), 0),
            transitions: transitionsByChunk.get(chunkId) ?? new Set<number>()
        }))
    return packChunks({
        chunks: placeableChunks,
        planningBudgetBytes: planningBudgetBytes
    }).map(createPackedSubpackage)
}

/** Creates every load-transition hyperedge and indexes its static closure by chunk. */
function collectTransitionsByChunk(
    chunks: ReadonlyMap<string, Rolldown.RenderedChunk>,
    assigned: ReadonlyMap<string, PackageLocation>
): Map<string, ReadonlySet<number>> {
    const transitionsByChunk = new Map<string, Set<number>>()
    let transitionId = 0
    for (const chunk of chunks.values()) {
        for (const targetId of [...chunk.dynamicImports].sort()) {
            if (!chunks.has(targetId) || assigned.has(targetId)) {
                continue
            }
            for (const chunkId of collectStaticClosure(chunks, [targetId], assigned)) {
                const transitions = transitionsByChunk.get(chunkId) ?? new Set<number>()
                transitions.add(transitionId)
                transitionsByChunk.set(chunkId, transitions)
            }
            transitionId++
        }
    }
    return transitionsByChunk
}

/** Follows static imports from the roots without entering chunks in stopAt. */
function collectStaticClosure(
    chunks: ReadonlyMap<string, Rolldown.RenderedChunk>,
    roots: Iterable<string>,
    stopAt: Pick<ReadonlySet<string>, 'has'>
): Set<string> {
    // The local stack and visited set expand each reachable chunk once, including in cyclic graphs.
    const pending = [...roots]
    const closure = new Set<string>()
    while (pending.length > 0) {
        const id = pending.pop()!
        if (closure.has(id) || stopAt.has(id)) {
            continue
        }
        const chunk = chunks.get(id)
        if (chunk) {
            closure.add(id)
            pending.push(...chunk.imports)
        }
    }
    return closure
}

/** Partitions final chunks by transition overlap before best-fit capacity. */
function packChunks({
    chunks,
    planningBudgetBytes
}: {
    chunks: readonly PlaceableChunk[]
    planningBudgetBytes: number
}): ChunkBin[] {
    const bins: ChunkBin[] = []
    const orderedChunks = [...chunks].sort(compareChunks)
    for (const chunk of orderedChunks) {
        const bin =
            chunk.estimatedBytes <= planningBudgetBytes
                ? (findBestBin({ bins: bins, chunk: chunk, planningBudgetBytes: planningBudgetBytes }) ??
                  createBin(bins))
                : createBin(bins)
        placeChunk(bin, chunk)
    }
    return bins
}

/** Gives globally shared transition demand priority, then size and stable preliminary filename. */
function compareChunks(left: PlaceableChunk, right: PlaceableChunk): number {
    return (
        right.transitions.size - left.transitions.size ||
        right.estimatedBytes - left.estimatedBytes ||
        left.chunkId.localeCompare(right.chunkId)
    )
}

/** Chooses maximum transition overlap, then the fullest fitting package and stable creation order. */
function findBestBin({
    bins,
    chunk,
    planningBudgetBytes
}: {
    bins: readonly ChunkBin[]
    chunk: PlaceableChunk
    planningBudgetBytes: number
}): ChunkBin | undefined {
    let best: BinCandidate | undefined
    for (const bin of bins) {
        if (bin.estimatedBytes + chunk.estimatedBytes > planningBudgetBytes) {
            continue
        }
        const candidate = {
            bin: bin,
            overlap: countOverlap(bin.transitions, chunk.transitions),
            remainingBytes: planningBudgetBytes - bin.estimatedBytes - chunk.estimatedBytes
        }
        if (
            !best ||
            candidate.overlap > best.overlap ||
            (candidate.overlap === best.overlap && candidate.remainingBytes < best.remainingBytes)
        ) {
            best = candidate
        }
    }
    return best?.bin
}

/** Counts transition-package incidences removed by one candidate placement. */
function countOverlap(left: ReadonlySet<number>, right: ReadonlySet<number>): number {
    const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left]
    let overlap = 0
    for (const transition of smaller) {
        if (larger.has(transition)) {
            overlap++
        }
    }
    return overlap
}

/** Creates one planner-local mutable package. */
function createBin(bins: ChunkBin[]): ChunkBin {
    const bin: ChunkBin = {
        chunkIds: [],
        estimatedBytes: 0,
        transitions: new Set<number>()
    }
    bins.push(bin)
    return bin
}

/** Applies one irreversible, non-duplicating final chunk assignment. */
function placeChunk(bin: ChunkBin, chunk: PlaceableChunk): void {
    bin.chunkIds.push(chunk.chunkId)
    bin.estimatedBytes += chunk.estimatedBytes
    for (const transition of chunk.transitions) {
        bin.transitions.add(transition)
    }
}

/** Estimates final output bytes from tree-shaken modules plus a bounded generated-chunk allowance. */
function estimateChunkBytes(chunk: Rolldown.RenderedChunk): number {
    const renderedModuleBytes = Object.values(chunk.modules).reduce(
        (bytes, module) => bytes + (module.code ? Buffer.byteLength(module.code, 'utf8') : 0),
        0
    )
    const moduleWrapperBytes = chunk.moduleIds.length * 64
    const referenceBytes = (chunk.imports.length + chunk.dynamicImports.length) * 32
    return renderedModuleBytes + moduleWrapperBytes + referenceBytes + 64
}

/** Freezes membership and derives a stable root from sorted preliminary filenames. */
function createPackedSubpackage(bin: ChunkBin): PackedSubpackage {
    const chunkIds = [...bin.chunkIds].sort()
    const hash = createHash('sha256').update(chunkIds.join('\0')).digest('hex').slice(0, 8)
    return {
        kind: 'subpackage',
        root: `${generatedSubpackageRootPrefix}${hash}`,
        chunkIds: chunkIds
    }
}

/** Tests the plugin-owned output prefix that physically identifies every generated subpackage. */
export function isGeneratedSubpackageFile(fileName: string): boolean {
    return fileName.startsWith(generatedSubpackageRootPrefix)
}
