import type { PluginTarget } from '@babel/core'
import transformDynamicImport from '@babel/plugin-transform-dynamic-import'
import transformModulesSystemjs from '@babel/plugin-transform-modules-systemjs'
import type { Rolldown } from 'vite'
import { type AstTransformResult, transformWithBabel } from '../../../utils/transform.ts'
import { wrapCapsulePlugin } from './capsule-wrapper.ts'

/** Renders one ESM chunk as an inert SystemJS capsule. */
export function renderCapsule(code: string, chunk: Rolldown.RenderedChunk): AstTransformResult {
    return transformWithBabel(code, chunk.fileName, [
        transformDynamicImport,
        // Erase Babel's internal plugin pass type.
        transformModulesSystemjs as PluginTarget,
        wrapCapsulePlugin
    ])
}
