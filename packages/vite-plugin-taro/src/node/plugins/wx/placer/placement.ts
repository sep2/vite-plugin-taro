import { createHash } from 'node:crypto'
import type { Rolldown } from 'vite'

// Leave headroom below WeChat's 2M subpackage limit for rendered wrappers and native assets.
export const subpackagePlanningBudget = 1_900_000
const generatedSubpackageRootPrefix = 'sub/p_'

/** Identifies one generated code-only subpackage by its physical output root. */
export type SubpackageLocation = {
    /** Discriminates generated subpackages from main. */
    kind: 'subpackage'
    /** Native subpackage root relative to the Mini Program output directory. */
    root: string
}

/** Physical package ownership for one final Rolldown chunk. */
export type PackageLocation = { kind: 'main' } | SubpackageLocation

/** Native app.json declaration for one generated code-only subpackage. */
export type GeneratedSubpackage = {
    /** Stable native alias derived from the generated root hash. */
    name: string
    /** Physical directory containing this subpackage's emitted capsules. */
    root: string
    /** Marks this as a code-only subpackage with no native Page routes. */
    pages: readonly []
}

/** Immutable ownership and materialization operations for one complete final-chunk graph. */
export type Placement = Readonly<{
    getPackageLocation(chunk: Rolldown.RenderedChunk | Rolldown.OutputChunk): PackageLocation
    getPhysicalChunkId(chunk: Rolldown.RenderedChunk): string
    getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async'
    finalize(bundle: Rolldown.OutputBundle): readonly GeneratedSubpackage[]
}>

/** Shared main-package value used for every synchronously reachable chunk. */
const mainPackage = { kind: 'main' } as const

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
 * 2. Reserve every explicit entry and its complete static closure in main because native startup must load it synchronously.
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
    chunks,
    getAdditionalModuleBytes
}: {
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>
    getAdditionalModuleBytes(moduleId: string): number
}): Placement {
    const chunkById = new Map(Object.entries(chunks).sort(([left], [right]) => left.localeCompare(right)))
    const mainChunkIds = findMainChunkIds(chunkById)
    const transitionsByChunk = collectTransitionsByChunk({ chunks: chunkById, mainChunkIds: mainChunkIds })
    const placeableChunks = [...chunkById]
        .filter(([chunkId]) => !mainChunkIds.has(chunkId))
        .map(([chunkId, chunk]) => ({
            chunkId: chunkId,
            estimatedBytes:
                estimateChunkBytes(chunk) +
                chunk.moduleIds.reduce((bytes, moduleId) => bytes + getAdditionalModuleBytes(moduleId), 0),
            transitions: transitionsByChunk.get(chunkId) ?? new Set<number>()
        }))
    const subpackages = packChunks({
        chunks: placeableChunks,
        planningBudgetBytes: subpackagePlanningBudget
    }).map(createPackedSubpackage)

    // This local map accumulates the immutable plan returned to output materialization.
    const locationByChunk = new Map<string, PackageLocation>()
    for (const chunkId of mainChunkIds) {
        locationByChunk.set(chunkId, mainPackage)
    }
    for (const subpackage of subpackages) {
        for (const chunkId of subpackage.chunkIds) {
            locationByChunk.set(chunkId, subpackage)
        }
    }
    function getLocation(chunkId: string): PackageLocation {
        const location = locationByChunk.get(chunkId)
        if (!location) {
            throw new Error(`wx placement is missing final chunk: ${chunkId}`)
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
        getPhysicalChunkId(chunk: Rolldown.RenderedChunk): string {
            const location = getPackageLocation(chunk)
            return location.kind === 'main' ? chunk.fileName : `${location.root}/${chunk.fileName}`
        },

        /** Selects the native loading API directly from typed package ownership. */
        getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async' {
            return getPackageLocation(chunk).kind === 'subpackage' ? 'async' : 'sync'
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
                roots.add(location.root)
            }

            return [...roots].sort().map((root) => ({
                name: root.slice(root.lastIndexOf('/') + 1),
                root: root,
                pages: []
            }))
        }
    }
}

/** Keeps every explicit output entry and its complete static chunk closure in main. */
function findMainChunkIds(chunks: ReadonlyMap<string, Rolldown.RenderedChunk>): Set<string> {
    const mainChunkIds = new Set<string>()
    // The worklist avoids recursion and visits every eager static edge once.
    const pending = [...chunks].filter(([, chunk]) => chunk.isEntry).map(([chunkId]) => chunkId)
    while (pending.length > 0) {
        const chunkId = pending.pop()
        if (!chunkId || mainChunkIds.has(chunkId)) {
            continue
        }
        const chunk = chunks.get(chunkId)
        if (!chunk) {
            continue
        }
        mainChunkIds.add(chunkId)
        pending.push(...chunk.imports)
    }
    return mainChunkIds
}

/** Creates every load-transition hyperedge and indexes its static closure by chunk. */
function collectTransitionsByChunk({
    chunks,
    mainChunkIds
}: {
    chunks: ReadonlyMap<string, Rolldown.RenderedChunk>
    mainChunkIds: ReadonlySet<string>
}): Map<string, ReadonlySet<number>> {
    const transitionsByChunk = new Map<string, Set<number>>()
    let transitionId = 0
    for (const chunk of chunks.values()) {
        for (const targetId of [...chunk.dynamicImports].sort()) {
            if (!chunks.has(targetId) || mainChunkIds.has(targetId)) {
                continue
            }
            for (const chunkId of collectStaticClosure({
                rootId: targetId,
                chunks: chunks,
                mainChunkIds: mainChunkIds
            })) {
                const transitions = transitionsByChunk.get(chunkId) ?? new Set<number>()
                transitions.add(transitionId)
                transitionsByChunk.set(chunkId, transitions)
            }
            transitionId++
        }
    }
    return transitionsByChunk
}

/** Collects one transition's static closure; nested dynamic imports remain independent transitions. */
function collectStaticClosure({
    rootId,
    chunks,
    mainChunkIds
}: {
    rootId: string
    chunks: ReadonlyMap<string, Rolldown.RenderedChunk>
    mainChunkIds: ReadonlySet<string>
}): string[] {
    const closure = new Set<string>()
    // The worklist follows static edges only; the visited set terminates cycles.
    const pending = [rootId]
    while (pending.length > 0) {
        const chunkId = pending.pop()
        if (!chunkId || closure.has(chunkId) || mainChunkIds.has(chunkId)) {
            continue
        }
        const chunk = chunks.get(chunkId)
        if (!chunk) {
            continue
        }
        closure.add(chunkId)
        pending.push(...chunk.imports)
    }
    return [...closure].sort()
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
