import type { Rolldown } from 'vite'
import { wxBootstrapEntryName } from '../virtual/virtual-modules.ts'
import { renderBootstrap } from './bootstrap/render-bootstrap.ts'
import { renderCapsule } from './capsule/render-capsule.ts'

/** Renders one final Rolldown chunk for WX. */
export function postRenderChunk(
    code: string,
    chunk: Pick<Rolldown.RenderedChunk, 'fileName' | 'isEntry' | 'name'>
): { code: string; map: Rolldown.ExistingRawSourceMap } {
    if (chunk.isEntry && chunk.name === wxBootstrapEntryName) {
        return renderBootstrap(code, chunk.fileName)
    }

    return renderCapsule(code, chunk.fileName)
}
