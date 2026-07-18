import type { Rolldown } from 'vite'
import { isTransportModule } from '../native/is-native-module.ts'

export type PackageLocation = { kind: 'main' } | { kind: 'subpackage'; root: string }
export type LoadMode = 'sync' | 'async'
export type ModuleKind = 'eager' | 'lazy'

type ChunkInfo = Pick<Rolldown.PreRenderedChunk, 'moduleIds'>
type Graph = {
    moduleIds: Iterable<string>
    getModuleInfo(moduleId: string): Rolldown.ModuleInfo | null
}
type PendingModule = {
    moduleId: string
    crossedDynamicBoundary: boolean
}

const mainPackage: PackageLocation = { kind: 'main' }

/** Creates the package-placement planner. The initial implementation places every chunk in the main package. */
export function createPlacer() {
    let moduleKinds = new Map<string, ModuleKind>()

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

        /** Places the initial shared and dynamic chunk graph in main-package assets. */
        chunkFileNames(): string {
            return 'assets/[name]-[hash].js'
        },

        /** Returns the physical package selected for one chunk. */
        locateChunk(_chunk: ChunkInfo): PackageLocation {
            return mainPackage
        },

        /** Main transport can synchronously load every chunk in the initial placement. */
        getLoadMode(_chunk: ChunkInfo): LoadMode {
            return 'sync'
        }
    }
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
