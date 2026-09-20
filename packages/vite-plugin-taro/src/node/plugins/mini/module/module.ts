import path from 'node:path'
import { normalizePath, type Rolldown } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { packageRequire } from '../../../utils/packages.ts'
import type { RuntimeModulesContract } from '../mini-contract.ts'

// Resolve from the plugin: pnpm consumers do not expose this transitive dependency to injected app imports.
export const miniRuntimeId = packageRequire.resolve('vite-plugin-taro-runtime/runtime/mini')

/** Identifies Rolldown's generated helper module independently of its unstable output filename. */
export const rolldownRuntimeId = '\0rolldown/runtime.js'

/** Identifies the virtual binding shared by native files, SystemJS capsules and HMR factories. */
export const vptGlobalBindingId = '\0vpt:global-binding'

/** Generates the selected core-js imports as one independently executable output entry. */
export const miniPolyfillsId = '\0vpt:mini-polyfills'

/** External bootstrap dependency emitted only after the bundled graph is finalized. */
export const miniTransportId = '\0vpt:mini-transport'
export const miniTransportFileName = 'common/vpt/transport.js'

/** Resolves the shared Taro facade's target initialization side effect. */
export const taroTargetRuntimeId = '\0vpt:taro-target-runtime'

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
}>

/** Classifies chunks by explicit runtime roles. */
export type MiniModuleClassifier = (chunk: MiniChunk) => MiniChunkClassification

type MiniRuntimeModuleKind = MiniEntryRole | 'amphibious'

const frameworkPackageRoots = [
    // The exported Mini entry is <runtime package>/dist/runtime/index.js, regardless of where the package is installed or linked.
    path.resolve(path.dirname(miniRuntimeId), '../..'),
    ...['react', 'react-dom'].map((name) => path.dirname(packageRequire.resolve(`${name}/package.json`)))
].map((root) => `${normalizePath(root)}/`)

const polyfillPackageRoot = `${normalizePath(path.dirname(packageRequire.resolve('core-js/package.json')))}/`

/** Native hook filter for the physical core-js graph; the generated import-only entry needs no host rewriting. */
export const miniPolyfillSourceFilter = new RegExp(`^${polyfillPackageRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)

/** Keeps the global binding and core-js in the pre-bootstrap native chunk, outside the recursive framework group. */
export function isMiniPolyfillModule(moduleId: string): boolean {
    const normalizedId = normalizePath(moduleId)
    return (
        normalizedId === miniPolyfillsId ||
        normalizedId === vptGlobalBindingId ||
        normalizedId.startsWith(polyfillPackageRoot)
    )
}

/** Groups framework modules by resolved package roots; Rolldown includes their dependencies. */
export function isMiniFrameworkVendorModule(moduleId: string): boolean {
    const normalizedId = normalizePath(moduleId)
    return frameworkPackageRoots.some((root) => normalizedId.startsWith(root))
}

/**
 * Classifies explicit runtime entries in one module-ID scan; framework vendor remains a capsule.
 * Amphibious chunks share bootstrap's bridge so native and SystemJS callers reuse the same exports.
 * Construction is O(1); each lookup is O(M), where M is the number of modules in the chunk.
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
        [vptGlobalBindingId, 'amphibious'],
        [miniPolyfillsId, 'amphibious'],
        [rolldownRuntimeId, 'amphibious']
    ])

    return (chunk) => {
        // These local flags accumulate one chunk's classification during its sole module-ID traversal.
        let ownsShell = false
        let ownsCapsule = false
        let isAmphibious = false

        for (const moduleId of chunk.moduleIds) {
            const normalizedId = normalizeModuleId(moduleId)

            const kind = moduleKindById.get(normalizedId)

            switch (kind) {
                case 'shell':
                    ownsShell = true
                    break
                case 'capsule':
                    ownsCapsule = true
                    break
                case 'amphibious':
                    isAmphibious = true
                    break
            }
        }

        if (ownsShell && ownsCapsule) {
            throw new Error(`Mini Program chunk mixes shell and capsule entries: ${chunk.moduleIds.join(', ')}`)
        }

        const entryRole = ownsShell ? 'shell' : ownsCapsule ? 'capsule' : undefined
        return {
            entryRole: entryRole,
            executionKind: isAmphibious ? 'amphibious' : entryRole === 'shell' ? 'native' : 'capsule'
        }
    }
}
