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

/** Generates the selected core-js imports loaded by bootstrap from the native polyfill chunk. */
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

/** Distinguishes native shells, lifecycle entry capsules, ordinary capsules, and shared native/SystemJS infrastructure. */
export type MiniChunkKind = 'native' | 'entry-capsule' | 'normal-capsule' | 'amphibious'

/** Classifies chunks by their compiler-owned modules; ordinary application chunks are normal capsules. */
export type MiniModuleClassifier = (chunk: MiniChunk) => MiniChunkKind

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
 * The Mini graph separates lifecycle entries from bootstrap/polyfill/runtime infrastructure. A compiler-owned module
 * identifies its chunk's kind; chunks containing only application or framework modules are normal capsules.
 * One scan stops at the first known identity: O(M) worst-case time and O(1) extra space, without per-chunk collections.
 */
export function createMiniModuleClassifier(modules: RuntimeModulesContract): MiniModuleClassifier {
    const moduleKindById: ReadonlyMap<string, MiniChunkKind> = new Map([
        [modules.appShell, 'native'],
        [modules.componentShell, 'native'],
        [modules.customWrapperShell, 'native'],
        [modules.pageShell, 'native'],
        [modules.appCapsule, 'entry-capsule'],
        [modules.componentCapsule, 'entry-capsule'],
        [modules.pageCapsule, 'entry-capsule'],
        [modules.bootstrap, 'amphibious'],
        [vptGlobalBindingId, 'amphibious'],
        [miniPolyfillsId, 'amphibious'],
        [rolldownRuntimeId, 'amphibious']
    ])

    return (chunk) => {
        for (const moduleId of chunk.moduleIds) {
            const kind = moduleKindById.get(normalizeModuleId(moduleId))
            if (kind !== undefined) {
                return kind
            }
        }
        return 'normal-capsule'
    }
}
