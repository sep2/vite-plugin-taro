import type { Rolldown } from 'vite'
import { resolvePackageFile } from '../../utils/packages.ts'

/** Identifies Rolldown's generated helper module independently of its unstable output filename. */
export const rolldownRuntimeId = '\0rolldown/runtime.js'

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

/** Forces Taro's recursive native Component entry to emit at its configured root path. */
export const componentShellFileName = 'comp.js'

/** Identifies the synchronous recursive Component shell source. */
export const componentShellPath = resolvePackageFile('dist/runtime/wx/native/component.js')

/** Resolves the configured Page component from its route-qualified capsule importer. */
export const pageComponentId = '\0vpt:page-component'

/** Gives every Page shell one private capsule target that can be resolved using its route. */
export const pageCapsuleId = '\0vpt:page-capsule'

/** Provides the Page capsule source specialized through a stable route query. */
export const pageCapsulePath = resolvePackageFile('dist/runtime/wx/capsule/page.js')

/** Identifies the reusable synchronous native Page shell source. */
export const pageShellPath = resolvePackageFile('dist/runtime/wx/native/page.js')

export type WxChunk = Rolldown.PreRenderedChunk | Rolldown.RenderedChunk

/** The execution domains in which one final wx JavaScript module participates. */
export type WxModuleKind = 'native' | 'capsule' | 'amphibious'

// Cross-boundary identity is centralized here so future plugin-owned native runtimes join both rendering domains by
// adding one source module ID, without teaching transport or render hooks about another special case.
const amphibiousModuleIds: ReadonlySet<string> = new Set([bootstrapPath, rolldownRuntimeId])

/** Tests whether a chunk contains the physical transport implementation. */
export function isTransportModule(chunk: WxChunk): boolean {
    return chunk.moduleIds.includes(transportPath)
}

/**
 * Classifies one final output module by execution domain:
 *
 * - native modules execute only through WeChat CommonJS;
 * - capsules are inert SystemJS registrations;
 * - amphibious modules execute through CommonJS and publish that same namespace to SystemJS.
 *
 * Amphibious identity takes precedence over entry identity. This keeps the classification correct if Rolldown ever
 * coalesces an amphibious implementation into an entry chunk: the chunk still needs native rendering and a transport
 * registration. New plugin-owned cross-boundary modules join the amphibious ID set above without changing rendering or
 * transport code.
 */
export function getWxModuleKind(chunk: WxChunk): WxModuleKind {
    if (chunk.moduleIds.some((moduleId) => amphibiousModuleIds.has(moduleId))) {
        return 'amphibious'
    }
    if (chunk.isEntry || isTransportModule(chunk)) {
        return 'native'
    }
    return 'capsule'
}
