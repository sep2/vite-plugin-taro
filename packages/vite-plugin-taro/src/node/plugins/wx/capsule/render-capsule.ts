import { type PluginTarget, transformSync } from '@babel/core'
import transformDynamicImport from '@babel/plugin-transform-dynamic-import'
import transformModulesSystemjs from '@babel/plugin-transform-modules-systemjs'
import type { Rolldown } from 'vite'
import { systemRegisterCapsulePlugin } from './system-register.ts'

/** Renders one ESM chunk as an inert SystemJS capsule. */
export function renderCapsule(
    code: string,
    chunk: Rolldown.RenderedChunk
): { code: string; map: Rolldown.ExistingRawSourceMap } {
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
