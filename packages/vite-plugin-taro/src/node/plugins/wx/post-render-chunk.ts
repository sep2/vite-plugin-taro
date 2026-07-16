import type { Rolldown } from 'vite'
import { appShellFileName } from './app/constant.ts'
import { renderAppShell } from './app/render-app-shell.ts'
import { renderCapsule } from './capsule/render-capsule.ts'

/** Renders one final Rolldown chunk for WX. */
export function postRenderChunk(
    code: string,
    chunk: Pick<Rolldown.RenderedChunk, 'fileName' | 'isEntry' | 'name'>
): { code: string; map: Rolldown.ExistingRawSourceMap } {
    if (chunk.isEntry && chunk.name === appShellFileName) {
        return renderAppShell(code, chunk.fileName)
    }
    return renderCapsule(code, chunk.fileName)
}
