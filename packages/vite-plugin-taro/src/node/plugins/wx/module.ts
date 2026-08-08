import path from 'node:path'
import type { Rolldown } from 'vite'
import { normalizeModuleId } from '../../utils/modules.ts'
import { packageRequire, resolvePackageFile } from '../../utils/packages.ts'

/** Identifies Rolldown's generated helper module independently of its unstable output filename. */
export const rolldownRuntimeId = '\0rolldown/runtime.js'

/** Resolves the direct React Reconciler dependency without assuming pnpm's layout. */
export const reactReconcilerRoot = normalizeModuleId(
    path.dirname(packageRequire.resolve('react-reconciler/package.json'))
)

/** Identifies the amphibious bootstrap that initializes SystemJS and serves every native shell. */
export const bootstrapPath = resolvePackageFile('dist/runtime/wx/amphibious/bootstrap.js')

/** Identifies the native transport source materialized before Rolldown finalizes content hashes. */
export const transportPath = resolvePackageFile('dist/runtime/wx/amphibious/transport.js')

/** Redirects Vite's injected browser preload helper to the bootstrap identity loader. */
export const vitePreloadId = '\0vite/preload-helper.js'

/** Forces the native App shell entry to emit at WeChat's required root path. */
export const appShellFileName = 'app.js'

/** Identifies the synchronous native App shell source. */
export const appShellPath = resolvePackageFile('dist/runtime/wx/native/app.js')

/** Identifies the App capsule kept behind the native shell boundary. */
export const appCapsulePath = resolvePackageFile('dist/runtime/wx/capsule/app.js')

/** Forces Taro's recursive native Component entry to emit at its configured root path. */
export const componentShellFileName = 'comp.js'

/** Identifies the synchronous recursive Component shell source. */
export const componentShellPath = resolvePackageFile('dist/runtime/wx/native/component.js')

/** Identifies the recursive Component capsule kept behind the native shell boundary. */
export const componentCapsulePath = resolvePackageFile('dist/runtime/wx/capsule/component.js')

/** Resolves the configured Page component from its route-qualified capsule importer. */
export const pageComponentId = '\0vpt:page-component'

/** Gives every Page shell one private capsule target that can be resolved using its route. */
export const pageCapsuleId = '\0vpt:page-capsule'

/** Provides the Page capsule source specialized through a stable route query. */
export const pageCapsulePath = resolvePackageFile('dist/runtime/wx/capsule/page.js')

/** Identifies the Taro facade shared by the App, Page, and recursive Component capsules. */
export const taroRuntimePath = resolvePackageFile('dist/runtime/wx/capsule/taro-runtime.js')

/** Identifies the reusable synchronous native Page shell source. */
export const pageShellPath = resolvePackageFile('dist/runtime/wx/native/page.js')

export type WxChunk = Rolldown.PreRenderedChunk | Rolldown.RenderedChunk

/** Build-graph role of an explicit native lifecycle entry. */
export type WxEntryRole = 'shell' | 'capsule'

/** Runtime domain in which one final wx JavaScript chunk executes. */
export type WxExecutionKind = 'native' | 'capsule' | 'amphibious'

// These fixed source identities describe entry roles independently from the final execution kind. A capsule entry may,
// for example, become amphibious when Rolldown coalesces its generated runtime into the same output chunk.
const shellModuleIds: ReadonlySet<string> = new Set([appShellPath, componentShellPath, pageShellPath])
const capsuleModuleIds: ReadonlySet<string> = new Set([appCapsulePath, componentCapsulePath, pageCapsulePath])
const amphibiousModuleIds: ReadonlySet<string> = new Set([bootstrapPath, rolldownRuntimeId])
const transportModuleIds: ReadonlySet<string> = new Set([transportPath])

/** Returns the one explicit lifecycle role owned by a chunk. */
export function getWxEntryRole(chunk: WxChunk): WxEntryRole | undefined {
    const ownsShell = containsModule(chunk, shellModuleIds)
    const ownsCapsule = containsModule(chunk, capsuleModuleIds)
    if (ownsShell && ownsCapsule) {
        throw new Error(`wx chunk mixes shell and capsule entries: ${chunk.moduleIds.join(', ')}`)
    }
    return ownsShell ? 'shell' : ownsCapsule ? 'capsule' : undefined
}

/** Tests whether a chunk contains the physical transport implementation. */
export function isTransportModule(chunk: WxChunk): boolean {
    return containsModule(chunk, transportModuleIds)
}

/**
 * Classifies one final output chunk by execution domain. Entry role is deliberately independent: explicit capsule entries
 * normally fall through to capsule rendering, but a capsule containing an amphibious runtime executes in both domains.
 */
export function getWxExecutionKind(chunk: WxChunk): WxExecutionKind {
    const entryRole = getWxEntryRole(chunk)
    if (containsModule(chunk, amphibiousModuleIds)) {
        return 'amphibious'
    }
    return entryRole === 'shell' || isTransportModule(chunk) ? 'native' : 'capsule'
}

/** Tests normalized chunk module IDs against one fixed identity set. */
function containsModule(chunk: WxChunk, moduleIds: ReadonlySet<string>): boolean {
    return chunk.moduleIds.some((moduleId) => moduleIds.has(normalizeModuleId(moduleId)))
}
