import type { Rolldown } from 'vite'
import { bootstrapPath, rolldownRuntimeId, transportPath } from './constant.ts'

export type AbstractChunk = Rolldown.PreRenderedChunk | Rolldown.RenderedChunk

/** The execution domains in which one final WX JavaScript module participates. */
export type WxModuleKind = 'native' | 'capsule' | 'amphibious'

// Cross-boundary identity is centralized here so future plugin-owned native runtimes join both rendering domains by
// adding one source module ID, without teaching transport or render hooks about another special case.
const amphibiousModuleIds: ReadonlySet<string> = new Set([bootstrapPath, rolldownRuntimeId])

/** Tests whether a chunk contains the transport implementation. */
export function isTransportModule(chunk: AbstractChunk): boolean {
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
 * registration. New plugin-owned cross-boundary modules join the amphibious ID test here, without changing rendering or
 * transport code.
 */
export function getWxModuleKind(chunk: AbstractChunk): WxModuleKind {
    if (chunk.moduleIds.some((moduleId) => amphibiousModuleIds.has(moduleId))) {
        return 'amphibious'
    }
    if (chunk.isEntry || isTransportModule(chunk)) {
        return 'native'
    }
    return 'capsule'
}
