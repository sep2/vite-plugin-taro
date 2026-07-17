import type { Rolldown } from 'vite'
import { bootstrapPath } from './constant.ts'

/** Tests whether a chunk contains the shared native bootstrap. */
export function isBootstrapModule(chunk: Rolldown.RenderedChunk): boolean {
    return bootstrapPath in chunk.modules
}

/** Tests whether a chunk executes through native CommonJS. */
export function isNativeModule(chunk: Rolldown.RenderedChunk): boolean {
    return chunk.isEntry || isBootstrapModule(chunk)
}
