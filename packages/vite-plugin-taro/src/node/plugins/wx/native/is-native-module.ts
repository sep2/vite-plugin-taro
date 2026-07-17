import type { Rolldown } from 'vite'
import { bootstrapPath } from './constant.ts'

/** Tests whether a chunk executes through native CommonJS. */
export function isNativeModule(chunk: Pick<Rolldown.RenderedChunk, 'isEntry' | 'modules'>): boolean {
    return chunk.isEntry || bootstrapPath in chunk.modules
}
