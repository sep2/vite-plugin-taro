import { type PluginTarget, transformSync } from '@babel/core'
import transformDynamicImport from '@babel/plugin-transform-dynamic-import'
import transformModulesSystemjs from '@babel/plugin-transform-modules-systemjs'
import type { Rolldown } from 'vite'
import { systemRegisterCapsulePlugin } from './system-register.ts'

/** Converts one final Rolldown ESM chunk into an inert native System registration capsule. */
export function postRenderChunk(
    code: string,
    chunk: Rolldown.RenderedChunk
): { code: string; map: Rolldown.SourceMapInput } {
    const capsule = transformSync(code, {
        babelrc: false,
        compact: false,
        configFile: false,
        filename: chunk.fileName,
        plugins: [
            transformDynamicImport,
            // Babel exposes this plugin's internal pass state in its public type, while PluginTarget intentionally erases it.
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

    return {
        code: capsule.code,
        map: {
            ...capsule.map,
            names: [...capsule.map.names],
            sources: [...capsule.map.sources],
            sourcesContent: capsule.map.sourcesContent ? [...capsule.map.sourcesContent] : undefined
        }
    }
}
