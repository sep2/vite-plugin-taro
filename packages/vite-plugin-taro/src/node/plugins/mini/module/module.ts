import path from 'node:path'
import { normalizePath, type Rolldown } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { packageRequire, resolveRuntimeFile } from '../../../utils/packages.ts'

/** Identifies Rolldown's generated helper module independently of its unstable output filename. */
export const rolldownRuntimeId = '\0rolldown/runtime.js'

/** Resolves the direct React Reconciler dependency without assuming pnpm's layout. */
export const reactReconcilerRoot = normalizePath(path.dirname(packageRequire.resolve('react-reconciler/package.json')))

/** Identifies the amphibious bootstrap that initializes SystemJS and serves every native shell. */
export const bootstrapPath = resolveRuntimeFile('wx/amphibious/bootstrap')

/** Identifies the native transport source materialized before Rolldown finalizes content hashes. */
export const transportPath = resolveRuntimeFile('wx/amphibious/transport')

/** Redirects Vite's injected browser preload helper to the bootstrap identity loader. */
export const vitePreloadId = '\0vite/preload-helper.js'

/** Forces the native App shell entry to emit at WeChat's required root path. */
export const appShellFileName = 'app.js'

/** Identifies the synchronous native App shell source. */
export const appShellPath = resolveRuntimeFile('wx/native/app')

/** Identifies the App capsule kept behind the native shell boundary. */
export const appCapsulePath = resolveRuntimeFile('wx/capsule/app')

/** Forces Taro's recursive native Component entry to emit at its configured root path. */
export const componentShellFileName = 'comp.js'

/** Identifies the synchronous recursive Component shell source. */
export const componentShellPath = resolveRuntimeFile('wx/native/component')

/** Identifies the recursive Component capsule shared by generated Taro component shells. */
export const componentCapsulePath = resolveRuntimeFile('wx/capsule/component')

/** Forces Taro's CustomWrapper native shell to emit at its configured root path. */
export const customWrapperShellFileName = 'custom-wrapper.js'

/** Identifies the synchronous CustomWrapper shell source. */
export const customWrapperShellPath = resolveRuntimeFile('wx/native/custom-wrapper')

/** Resolves the configured Page component from its route-qualified capsule importer. */
export const pageComponentId = '\0vpt:page-component'

/** Gives every Page shell one private capsule target that can be resolved using its route. */
export const pageCapsuleId = '\0vpt:page-capsule'

/** Provides the Page capsule source specialized through a stable route query. */
export const pageCapsulePath = resolveRuntimeFile('wx/capsule/page')

/** Identifies the Taro facade shared by the App, Page, and generated component capsules. */
export const taroRuntimePath = resolveRuntimeFile('wx/capsule/taro-runtime')

/** Identifies the reusable synchronous native Page shell source. */
export const pageShellPath = resolveRuntimeFile('wx/native/page')

export type MiniChunk = Rolldown.PreRenderedChunk | Rolldown.RenderedChunk

/** Build-graph role of an explicit native lifecycle entry. */
export type MiniEntryRole = 'shell' | 'capsule'

/** Runtime domain in which one final Mini Program JavaScript chunk executes. */
export type MiniExecutionKind = 'native' | 'capsule' | 'amphibious'

// These fixed source identities describe entry roles independently from the final execution kind. A capsule entry may,
// for example, become amphibious when Rolldown coalesces its generated runtime into the same output chunk.
const shellModuleIds: ReadonlySet<string> = new Set([
    appShellPath,
    componentShellPath,
    customWrapperShellPath,
    pageShellPath
])
const capsuleModuleIds: ReadonlySet<string> = new Set([appCapsulePath, componentCapsulePath, pageCapsulePath])
const amphibiousModuleIds: ReadonlySet<string> = new Set([bootstrapPath, rolldownRuntimeId])
const transportModuleIds: ReadonlySet<string> = new Set([transportPath])

/** Returns the one explicit lifecycle role owned by a chunk. */
export function getMiniEntryRole(chunk: MiniChunk): MiniEntryRole | undefined {
    const ownsShell = containsModule(chunk, shellModuleIds)
    const ownsCapsule = containsModule(chunk, capsuleModuleIds)
    if (ownsShell && ownsCapsule) {
        throw new Error(`Mini Program chunk mixes shell and capsule entries: ${chunk.moduleIds.join(', ')}`)
    }
    return ownsShell ? 'shell' : ownsCapsule ? 'capsule' : undefined
}

/** Tests whether a chunk contains the physical transport implementation. */
export function isTransportModule(chunk: MiniChunk): boolean {
    return containsModule(chunk, transportModuleIds)
}

/**
 * Classifies one final output chunk by execution domain. Entry role is deliberately independent: explicit capsule entries
 * normally fall through to capsule rendering, but a capsule containing an amphibious runtime executes in both domains.
 */
export function getMiniExecutionKind(chunk: MiniChunk): MiniExecutionKind {
    const entryRole = getMiniEntryRole(chunk)
    if (containsModule(chunk, amphibiousModuleIds)) {
        return 'amphibious'
    }
    return entryRole === 'shell' || isTransportModule(chunk) ? 'native' : 'capsule'
}

/** Tests normalized chunk module IDs against one fixed identity set. */
function containsModule(chunk: MiniChunk, moduleIds: ReadonlySet<string>): boolean {
    return chunk.moduleIds.some((moduleId) => moduleIds.has(normalizeModuleId(moduleId)))
}
