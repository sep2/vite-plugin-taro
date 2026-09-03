import type { Rolldown } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import type { RuntimeModulesContract } from '../mini-contract.ts'

/** Identifies Rolldown's generated helper module independently of its unstable output filename. */
export const rolldownRuntimeId = '\0rolldown/runtime.js'

/** Resolves the shared Taro facade's platform initialization side effect. */
export const taroPlatformRuntimeId = '\0vpt:taro-platform-runtime'

/** Redirects Vite's injected browser preload helper to the bootstrap identity loader. */
export const vitePreloadId = '\0vite/preload-helper.js'

/** Forces the native App shell entry to emit at the required root path. */
export const appShellFileName = 'app.js'

/** Forces Taro's recursive native Component entry to emit at its configured root path. */
export const componentShellFileName = 'comp.js'

/** Forces Taro's CustomWrapper native shell to emit at its configured root path. */
export const customWrapperShellFileName = 'custom-wrapper.js'

/** Resolves the configured Page component from its route-qualified capsule importer. */
export const pageComponentId = '\0vpt:page-component'

/** Gives every Page shell one private capsule target that can be resolved using its route. */
export const pageCapsuleId = '\0vpt:page-capsule'

export type MiniChunk = Rolldown.PreRenderedChunk | Rolldown.RenderedChunk

/** Build-graph role of an explicit native lifecycle entry. */
export type MiniEntryRole = 'shell' | 'capsule'

/** Runtime domain in which one final Mini Program JavaScript chunk executes. */
export type MiniExecutionKind = 'native' | 'capsule' | 'amphibious'

/** Complete execution classification derived from one pass over a chunk's module IDs. */
export type MiniChunkClassification = Readonly<{
    entryRole: MiniEntryRole | undefined
    executionKind: MiniExecutionKind
    isTransport: boolean
}>

/** Classifies final chunks against one immutable shared-runtime module table. */
export type MiniModuleClassifier = (chunk: MiniChunk) => MiniChunkClassification

type MiniRuntimeModuleKind = MiniEntryRole | 'amphibious' | 'transport'

/**
 * Creates a classifier whose fixed identity sets are shared by every chunk in one plugin instance.
 *
 * Construction is O(1). Each classification normalizes every module ID exactly once and runs in O(M), where M is the number
 * of modules in the chunk. This replaces separate shell, capsule, amphibious, and transport scans.
 */
export function createMiniModuleClassifier(modules: RuntimeModulesContract): MiniModuleClassifier {
    const moduleKindById: ReadonlyMap<string, MiniRuntimeModuleKind> = new Map([
        [modules.appShell, 'shell'],
        [modules.componentShell, 'shell'],
        [modules.customWrapperShell, 'shell'],
        [modules.pageShell, 'shell'],
        [modules.appCapsule, 'capsule'],
        [modules.componentCapsule, 'capsule'],
        [modules.pageCapsule, 'capsule'],
        [modules.bootstrap, 'amphibious'],
        [rolldownRuntimeId, 'amphibious'],
        [modules.transport, 'transport']
    ])

    return (chunk) => {
        // These local flags accumulate one chunk's classification during its sole module-ID traversal.
        let ownsShell = false
        let ownsCapsule = false
        let isAmphibious = false
        let isTransport = false

        for (const moduleId of chunk.moduleIds) {
            switch (moduleKindById.get(normalizeModuleId(moduleId))) {
                case 'shell':
                    ownsShell = true
                    break
                case 'capsule':
                    ownsCapsule = true
                    break
                case 'amphibious':
                    isAmphibious = true
                    break
                case 'transport':
                    isTransport = true
                    break
            }
        }

        if (ownsShell && ownsCapsule) {
            throw new Error(`Mini Program chunk mixes shell and capsule entries: ${chunk.moduleIds.join(', ')}`)
        }

        const entryRole = ownsShell ? 'shell' : ownsCapsule ? 'capsule' : undefined
        return {
            entryRole: entryRole,
            executionKind: isAmphibious ? 'amphibious' : entryRole === 'shell' || isTransport ? 'native' : 'capsule',
            isTransport: isTransport
        }
    }
}
