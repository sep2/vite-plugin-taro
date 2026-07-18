import type { Rolldown } from 'vite'
import { type AbstractChunk, isNativeModule, isTransportModule } from '../native/is-native-module.ts'

export type PackageLocation = { kind: 'main' } | { kind: 'subpackage'; root: string }
export type LoadMode = 'sync' | 'async'
export type ModuleKind = 'eager' | 'lazy'
type ChunkEligibility = 'main-required' | 'subpackage-eligible'

type Graph = {
    moduleIds: Iterable<string>
    getModuleInfo(moduleId: string): Rolldown.ModuleInfo | null
}

const mainPackage: PackageLocation = { kind: 'main' }

/** Creates the package-placement planner. The initial implementation places every chunk in the main package. */
export function createPlacer() {
    let moduleKinds = new Map<string, ModuleKind>()

    /** Returns the physical package selected for one chunk. */
    function locateChunk(chunk: AbstractChunk): PackageLocation {
        const eligibility = getChunkEligibility(moduleKinds, chunk)
        if (eligibility === 'main-required') {
            return mainPackage
        }

        // Eligible chunks remain in main until generated code-only packages are introduced.
        return mainPackage
    }

    return {
        /** Classifies the complete graph without changing its initial main-package placement. */
        analyze(graph: Graph): void {
            moduleKinds = classifyModules(graph)
        },

        /** Returns how one application module is reached from the native entry graph. */
        getModuleKind(moduleId: string): ModuleKind | undefined {
            return moduleKinds.get(moduleId)
        },

        /** Preserves exact native entries while allowing transport to participate in content hashing. */
        entryFileNames(chunk: Rolldown.PreRenderedChunk): string {
            return isTransportModule(chunk) ? 'assets/[name]-[hash].js' : '[name]'
        },

        /** Names chunks from the package selected by the placement policy. */
        chunkFileNames(chunk: Rolldown.PreRenderedChunk): string {
            const location = locateChunk(chunk)
            return location.kind === 'main' ? 'assets/[name]-[hash].js' : `${location.root}/assets/[name]-[hash].js`
        },

        /** Selects native loading mode from the physical package boundary. */
        getLoadMode(chunk: AbstractChunk): LoadMode {
            return locateChunk(chunk).kind === 'main' ? 'sync' : 'async'
        }
    }
}

/** Derives physical-placement eligibility from every module Rolldown included in one chunk. */
function getChunkEligibility(moduleKinds: Map<string, ModuleKind>, chunk: AbstractChunk): ChunkEligibility {
    if (isNativeModule(chunk) || chunk.moduleIds.length === 0) {
        return 'main-required'
    }

    for (const moduleId of chunk.moduleIds) {
        const moduleKind = moduleKinds.get(moduleId)
        // Rolldown may synthesize output-only runtime modules after renderStart; keep every unknown module in main.
        if (!moduleKind || moduleKind === 'eager') {
            return 'main-required'
        }
    }
    return 'subpackage-eligible'
}

type PendingModule = {
    moduleId: string
    crossedDynamicBoundary: boolean
}

/** Classifies static entry closures as eager and dynamic-only closures as lazy. */
function classifyModules({ moduleIds, getModuleInfo }: Graph): Map<string, ModuleKind> {
    const eagerModules = new Set<string>()
    const lazyModules = new Set<string>()
    const pending: PendingModule[] = []

    for (const moduleId of moduleIds) {
        if (getModuleInfo(moduleId)?.isEntry) {
            pending.push({ moduleId, crossedDynamicBoundary: false })
        }
    }

    while (pending.length > 0) {
        const current = pending.pop()
        if (!current) {
            continue
        }

        const visited = current.crossedDynamicBoundary ? lazyModules : eagerModules
        if (visited.has(current.moduleId)) {
            continue
        }

        const moduleInfo = getModuleInfo(current.moduleId)
        if (!moduleInfo) {
            continue
        }
        visited.add(current.moduleId)

        for (const importedId of moduleInfo.importedIds) {
            pending.push({
                moduleId: importedId,
                crossedDynamicBoundary: current.crossedDynamicBoundary
            })
        }
        for (const importedId of moduleInfo.dynamicallyImportedIds) {
            pending.push({ moduleId: importedId, crossedDynamicBoundary: true })
        }
    }

    const moduleKinds = new Map<string, ModuleKind>()
    for (const moduleId of lazyModules) {
        moduleKinds.set(moduleId, 'lazy')
    }
    // Static reachability wins when a module is reachable through both edge kinds.
    for (const moduleId of eagerModules) {
        moduleKinds.set(moduleId, 'eager')
    }
    return moduleKinds
}
