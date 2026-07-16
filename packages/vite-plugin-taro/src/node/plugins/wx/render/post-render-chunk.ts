import { type PluginTarget, transformSync } from '@babel/core'
import transformDynamicImport from '@babel/plugin-transform-dynamic-import'
import transformModulesSystemjs from '@babel/plugin-transform-modules-systemjs'
import type { Rolldown } from 'vite'
import { wxBootstrapEntryName } from '../virtual/virtual-modules.ts'
import { renderBootstrap } from './render-bootstrap.ts'
import { systemRegisterCapsulePlugin } from './system-register.ts'

/** Renders one final Rolldown chunk for WX. */
export function postRenderChunk(
    code: string,
    chunk: Pick<Rolldown.RenderedChunk, 'fileName' | 'isEntry' | 'name'>
): { code: string; map: Rolldown.ExistingRawSourceMap } {
    if (chunk.isEntry && chunk.name === wxBootstrapEntryName) {
        return renderBootstrap(code, chunk.fileName)
    }

    const capsule = transformSync(code, {
        babelrc: false,
        compact: false,
        configFile: false,
        filename: chunk.fileName,
        plugins: [
            transformDynamicImport,
            // Erase Babel's internal plugin pass type.
            transformModulesSystemjs as PluginTarget,
            systemRegisterCapsulePlugin
        ],
        sourceFileName: chunk.fileName,
        sourceMaps: true,
        sourceType: 'module'
    })

    if (!capsule?.code || !capsule.map) {
        throw new Error(`Failed to generate the capsule for ${chunk.fileName}`)
    }

    return { code: capsule.code, map: capsule.map as Rolldown.ExistingRawSourceMap }
}
