import { createHash } from 'node:crypto'
import type { Rolldown } from 'vite'

// Leave headroom below WeChat's 2M package limit for capsule wrappers and bundler-generated code.
const packagePlanningBudget = 1_900_000
const generatedPackageRootPrefix = '__dynamic__/p_'

/** Identifies one generated code-only package by its physical output root. */
export type SubpackageLocation = {
    /** Discriminates generated packages from main. */
    kind: 'subpackage'
    /** Native package root relative to the Mini Program output directory. */
    root: string
}

/** Physical package ownership for one transformed application module. */
export type PackageLocation = { kind: 'main' } | SubpackageLocation

/** Immutable module-to-package ownership produced before Rolldown creates chunks. */
export type PlacementPlan = ReadonlyMap<string, PackageLocation>

/** Minimal Rolldown graph interface consumed by the package planner. */
export type ModuleGraph = {
    /** Every transformed module known after graph construction. */
    moduleIds: Iterable<string>
    /** Reads static edges, dynamic edges, transformed code, and entry ownership. */
    getModuleInfo(moduleId: string): Rolldown.ModuleInfo | null
}

/** One independently movable lazy module together with size and co-location preferences. */
type PlacementItem = {
    /** Stable module identity and final ownership key. */
    moduleId: string
    /** UTF-8 size of transformed source used as the bin-packing estimate. */
    estimatedBytes: number
    /** Dynamic roots whose static closures contain this module. */
    consumers: ReadonlySet<string>
    /** Lazy modules connected by a direct static import in either direction. */
    neighbors: ReadonlySet<string>
}

/** Mutable package candidate used only while best-fit packing is in progress. */
type PackageBin = {
    /** Modules currently assigned to this mutable packing candidate. */
    moduleIds: string[]
    /** Accumulated transformed-source estimate. */
    estimatedBytes: number
    /** Dynamic roots represented by at least one assigned module. */
    consumers: Set<string>
}

/** Final membership and stable physical location for one generated package. */
type PackedPackage = SubpackageLocation & {
    /** Sorted membership used both for stable hashing and ownership assignment. */
    moduleIds: readonly string[]
}

/** Shared main-package value used for every eager or output-generated module. */
export const mainPackage = { kind: 'main' } as const

/**
 * Creates one deterministic package plan:
 *
 * 1. Snapshot Rolldown's transformed module graph.
 * 2. Reserve every explicit entry and its eager application closure for main.
 * 3. Annotate remaining modules with dynamic-root and static-edge affinity.
 * 4. Pack those lazy modules independently under the planning budget.
 * 5. Return only module ownership; chunks and native manifests are reconciled later.
 *
 * Static cycles are deliberately not atomic. Once a dynamic boundary has been crossed, SystemJS may obtain registrations
 * from multiple physical packages asynchronously and still link the original static ESM graph before execution.
 */
export function createPlacementPlan({
    moduleIds,
    getModuleInfo,
    planningBudgetBytes = packagePlanningBudget
}: ModuleGraph & { planningBudgetBytes?: number }): PlacementPlan {
    // Materialize the iterable once because every later phase needs stable random access by module ID.
    const infos = new Map<string, Rolldown.ModuleInfo>()
    for (const moduleId of moduleIds) {
        const info = getModuleInfo(moduleId)
        if (info) {
            infos.set(moduleId, info)
        }
    }

    // Eager ownership is a hard constraint; consumer and neighbor sets below are soft packing preferences only.
    const eagerModules = findEagerModules(infos)
    const consumersByModule = findLazyConsumers({ infos, eagerModules })
    const neighborsByModule = findLazyNeighbors({ infos, eagerModules })
    const lazyItems = [...infos.entries()]
        .filter(([moduleId]) => !eagerModules.has(moduleId))
        .map(([moduleId, info]) => ({
            moduleId,
            estimatedBytes: Buffer.byteLength(info.code ?? '', 'utf8'),
            consumers: consumersByModule.get(moduleId) ?? new Set([moduleId]),
            neighbors: neighborsByModule.get(moduleId) ?? new Set<string>()
        }))

    // Packing operates at module granularity, so a large lazy closure or cycle may span multiple packages.
    const packages = packItems({ items: lazyItems, planningBudgetBytes }).map(createPackedPackage)
    const packageByModule = new Map<string, PackageLocation>()
    for (const moduleId of eagerModules) {
        packageByModule.set(moduleId, mainPackage)
    }
    for (const packagePlan of packages) {
        for (const moduleId of packagePlan.moduleIds) {
            packageByModule.set(moduleId, packagePlan)
        }
    }

    return packageByModule
}

/**
 * Finds modules that must remain in main. Explicit native entries seed the traversal, their static imports remain eager,
 * and their direct dynamic imports are also eager because App and Page shells use import() only as a SystemJS capsule
 * activation mechanism. Dynamic imports below those application roots remain genuine lazy boundaries.
 */
function findEagerModules(infos: ReadonlyMap<string, Rolldown.ModuleInfo>): Set<string> {
    const eagerModules = new Set<string>()
    const pending = [...infos.values()].filter((info) => info.isEntry).map((info) => info.id)
    while (pending.length > 0) {
        const moduleId = pending.pop()
        if (!moduleId || eagerModules.has(moduleId)) {
            continue
        }

        const info = infos.get(moduleId)
        if (!info) {
            continue
        }
        eagerModules.add(moduleId)
        pending.push(...info.importedIds)
        // Native App and Page shells use import() to request their eager application capsules.
        if (info.isEntry) {
            pending.push(...info.dynamicallyImportedIds)
        }
    }
    return eagerModules
}

/**
 * Records dynamic-root demand for each lazy module. Every non-eager dynamic target starts one root traversal; that
 * traversal follows static edges only, stopping before nested dynamic boundaries. A shared module accumulates every root
 * that can request it. These consumer sets improve co-location but never prevent package splitting.
 */
function findLazyConsumers({
    infos,
    eagerModules
}: {
    infos: ReadonlyMap<string, Rolldown.ModuleInfo>
    eagerModules: ReadonlySet<string>
}): Map<string, Set<string>> {
    const dynamicRoots = new Set<string>()
    for (const info of infos.values()) {
        for (const importedId of info.dynamicallyImportedIds) {
            if (infos.has(importedId) && !eagerModules.has(importedId)) {
                dynamicRoots.add(importedId)
            }
        }
    }

    const consumersByModule = new Map<string, Set<string>>()
    for (const dynamicRoot of [...dynamicRoots].sort()) {
        const visited = new Set<string>()
        const pending = [dynamicRoot]
        while (pending.length > 0) {
            const moduleId = pending.pop()
            if (!moduleId || visited.has(moduleId) || eagerModules.has(moduleId)) {
                continue
            }

            const info = infos.get(moduleId)
            if (!info) {
                continue
            }
            visited.add(moduleId)
            const consumers = consumersByModule.get(moduleId) ?? new Set<string>()
            consumers.add(dynamicRoot)
            consumersByModule.set(moduleId, consumers)
            pending.push(...info.importedIds)
        }
    }
    return consumersByModule
}

/**
 * Converts each lazy static edge into an undirected affinity. Direction is irrelevant for co-location scoring, while the
 * original directed dependency remains in Rolldown and later in SystemJS. Cycles are therefore preferences, not atoms.
 */
function findLazyNeighbors({
    infos,
    eagerModules
}: {
    infos: ReadonlyMap<string, Rolldown.ModuleInfo>
    eagerModules: ReadonlySet<string>
}): Map<string, Set<string>> {
    const neighborsByModule = new Map<string, Set<string>>()
    for (const [moduleId, info] of infos) {
        if (eagerModules.has(moduleId)) {
            continue
        }
        for (const importedId of info.importedIds) {
            if (!infos.has(importedId) || eagerModules.has(importedId)) {
                continue
            }
            addNeighbor(neighborsByModule, moduleId, importedId)
            addNeighbor(neighborsByModule, importedId, moduleId)
        }
    }
    return neighborsByModule
}

/** Adds one side of an undirected lazy-module affinity edge. */
function addNeighbor(neighborsByModule: Map<string, Set<string>>, moduleId: string, neighborId: string): void {
    const neighbors = neighborsByModule.get(moduleId) ?? new Set<string>()
    neighbors.add(neighborId)
    neighborsByModule.set(moduleId, neighbors)
}

/**
 * Packs lazy modules with deterministic best-fit decreasing:
 *
 * 1. Visit larger transformed modules first, with module ID as the stable tie-breaker.
 * 2. Consider only existing bins that stay within the planning budget.
 * 3. Prefer the bin with the least remaining space, minimizing package count in the usual best-fit heuristic.
 * 4. When remaining space ties, prefer shared dynamic consumers and then static neighbors.
 * 5. Create a new bin when no existing bin fits; an individually oversized module receives its own bin.
 */
function packItems({
    items,
    planningBudgetBytes
}: {
    items: readonly PlacementItem[]
    planningBudgetBytes: number
}): PackageBin[] {
    const bins: PackageBin[] = []
    const sortedItems = [...items].sort((left, right) => {
        return right.estimatedBytes - left.estimatedBytes || left.moduleId.localeCompare(right.moduleId)
    })

    for (const item of sortedItems) {
        const candidate = bins
            .filter((bin) => bin.estimatedBytes + item.estimatedBytes <= planningBudgetBytes)
            .map((bin) => ({
                bin,
                remainingBytes: planningBudgetBytes - bin.estimatedBytes - item.estimatedBytes,
                affinity: getAffinity(bin, item)
            }))
            .sort((left, right) => {
                return left.remainingBytes - right.remainingBytes || right.affinity - left.affinity
            })[0]?.bin

        const bin = candidate ?? {
            moduleIds: [],
            estimatedBytes: 0,
            consumers: new Set<string>()
        }
        if (!candidate) {
            bins.push(bin)
        }
        bin.moduleIds.push(item.moduleId)
        bin.estimatedBytes += item.estimatedBytes
        for (const consumer of item.consumers) {
            bin.consumers.add(consumer)
        }
    }
    return bins
}

/** Scores dynamic-root overlap above direct static adjacency when equally full bins compete. */
function getAffinity(bin: PackageBin, item: PlacementItem): number {
    let affinity = 0
    for (const consumer of item.consumers) {
        if (bin.consumers.has(consumer)) {
            affinity += 2
        }
    }
    for (const neighbor of item.neighbors) {
        if (bin.moduleIds.includes(neighbor)) {
            affinity += 1
        }
    }
    return affinity
}

/** Freezes bin membership and derives a stable package root from sorted module IDs. */
function createPackedPackage(bin: PackageBin): PackedPackage {
    const moduleIds = [...bin.moduleIds].sort()
    const hash = createHash('sha256').update(moduleIds.join('\0')).digest('hex').slice(0, 8)
    return {
        kind: 'subpackage',
        root: `${generatedPackageRootPrefix}${hash}`,
        moduleIds
    }
}

/** Derives the native package alias from its generated physical root. */
export function getSubpackageName(location: SubpackageLocation): string {
    return `dynamic-${location.root.slice(generatedPackageRootPrefix.length)}`
}

/** Tests the plugin-owned output prefix that physically identifies every generated package. */
export function isGeneratedSubpackageFile(fileName: string): boolean {
    return fileName.startsWith(generatedPackageRootPrefix)
}
