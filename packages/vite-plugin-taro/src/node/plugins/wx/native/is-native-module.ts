import type { Rolldown } from 'vite'
import { bootstrapPath, transportPath } from './constant.ts'

export type AbstractChunk = Rolldown.PreRenderedChunk | Rolldown.RenderedChunk

/** Tests whether a chunk contains the shared native bootstrap. */
export function isBootstrapModule(chunk: AbstractChunk): boolean {
    return chunk.moduleIds.includes(bootstrapPath)
}

/** Tests whether a chunk contains the transport implementation. */
export function isTransportModule(chunk: AbstractChunk): boolean {
    return chunk.moduleIds.includes(transportPath)
}

/** Tests whether a chunk executes through native CommonJS. */
export function isNativeModule(chunk: AbstractChunk): boolean {
    return chunk.isEntry || isBootstrapModule(chunk) || isTransportModule(chunk)
}
