import path from 'node:path'
import { RUNTIME_MODULE_ID } from 'rolldown'
import { normalizePath, type Rolldown } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { packageRequire, resolveTaroRuntime, resolveVptRuntime } from '../../../utils/packages.ts'

/** Supplies initialized loader exports and the target's Page constructor to native shells. */
export const miniVptId = resolveVptRuntime('mini/amphibious/vpt')

/** Installs SystemJS, transport, and polyfills without importing constructors or application capsules. */
export const miniBootstrapId = resolveVptRuntime('mini/amphibious/bootstrap')

/** Registers the native App using its generated configuration capsule. */
export const miniAppShellId = resolveVptRuntime('mini/native/app')

/** Builds the App configuration and activates its React runtime. */
export const miniAppCapsuleId = resolveVptRuntime('mini/capsule/app')

/** Registers the recursive native Component from its capsule configuration. */
export const miniComponentShellId = resolveVptRuntime('mini/native/component')

/** Supplies the recursive Component and CustomWrapper configurations. */
export const miniComponentCapsuleId = resolveVptRuntime('mini/capsule/component')

/** Registers the native CustomWrapper from the shared component capsule. */
export const miniCustomWrapperShellId = resolveVptRuntime('mini/native/custom-wrapper')

/** Registers each route's native Page using its route-qualified capsule. */
export const miniPageShellId = resolveVptRuntime('mini/native/page')

/** Selects the native page constructor through the target contract. */
export const miniPageConstructorId = 'vpt:mini-page-constructor'

/** Passes Taro's flat config directly to native Page. */
export const miniPageConstructorRuntimeId = resolveVptRuntime('mini/native/mini-page-constructor')

/** Specializes each route's Page configuration and component import. */
export const miniPageCapsuleId = resolveVptRuntime('mini/capsule/page')

// Resolve from the plugin: pnpm consumers do not expose this transitive dependency to injected app imports.
export const miniTaroRuntimeId = resolveTaroRuntime('runtime/mini')

/** Identifies Rolldown's generated helper module independently of its unstable output filename. */
export const rolldownRuntimeId = RUNTIME_MODULE_ID

/** Identifies the virtual binding shared by native files, SystemJS capsules and HMR factories. */
export const vptGlobalBindingId = '\0vpt:global-binding'

/** Generates the selected core-js imports loaded before SystemJS from the native polyfill chunk. */
export const miniPolyfillsId = '\0vpt:mini-polyfills'

/** External loader dependency emitted only after the bundled graph is finalized. */
export const miniTransportId = '\0vpt:mini-transport'

export const miniTransportOutputPath = 'common/vpt/transport.js'

/** Resolves the shared Taro facade's target initialization side effect. */
export const taroTargetRuntimeId = '\0vpt:taro-target-runtime'

/** Redirects Vite's injected browser preload helper to the SystemJS entry's identity loader. */
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

const frameworkPackageRoots = [
    // The exported Mini entry is <runtime package>/dist/runtime/index.js, regardless of where the package is installed or linked.
    path.resolve(path.dirname(miniTaroRuntimeId), '../..'),
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

/** Fixed Mini graph identities are indexed once; classification scans module IDs until the first match. */
const moduleKindById: ReadonlyMap<string, MiniChunkKind> = new Map([
    [miniAppShellId, 'native'],
    [miniComponentShellId, 'native'],
    [miniCustomWrapperShellId, 'native'],
    [miniPageShellId, 'native'],
    [miniAppCapsuleId, 'entry-capsule'],
    [miniComponentCapsuleId, 'entry-capsule'],
    [miniPageCapsuleId, 'entry-capsule'],
    [miniVptId, 'amphibious'],
    [miniBootstrapId, 'amphibious'],
    [vptGlobalBindingId, 'amphibious'],
    [miniPolyfillsId, 'amphibious'],
    [rolldownRuntimeId, 'amphibious']
])

/** Classifies compiler-owned entry facades and modules; ordinary application chunks are normal capsules. O(M) time. */
export function classifyMiniModule(chunk: MiniChunk): MiniChunkKind {
    // Rolldown may extract an entry's implementation into a shared chunk, leaving an import-only facade.
    const entryKind = chunk.facadeModuleId && moduleKindById.get(normalizeModuleId(chunk.facadeModuleId))
    if (entryKind) {
        return entryKind
    }

    for (const moduleId of chunk.moduleIds) {
        const kind = moduleKindById.get(normalizeModuleId(moduleId))
        if (kind !== undefined) {
            return kind
        }
    }
    return 'normal-capsule'
}
