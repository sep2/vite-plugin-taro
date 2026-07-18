import path from 'node:path'
import { type PluginObject, type PluginTarget, types } from '@babel/core'
import transformModulesCommonjs from '@babel/plugin-transform-modules-commonjs'
import type { Rolldown } from 'vite'
import { chunkIdToModuleUrl } from '../../../utils/modules.ts'
import { type AstTransformResult, transformWithBabel } from '../../../utils/transform.ts'

/** Renders a synchronous native module. */
export function renderNative(code: string, chunk: Rolldown.RenderedChunk): AstTransformResult {
    return transformWithBabel(code, chunk.fileName, [
        connectNativeImportPlugin(chunk.fileName) as PluginTarget,
        transformModulesCommonjs as PluginTarget
    ])
}

/**
 * Preserves Rolldown's ESM graph while adapting its final native chunks to WeChat's synchronous CommonJS runtime.
 * Application chunks remain asynchronous SystemJS capsules, so native dynamic imports must cross that boundary explicitly.
 */
function connectNativeImportPlugin(fileName: string): PluginObject {
    return {
        name: 'vite-plugin-taro:connect-native-import',
        visitor: {
            ImportExpression(importPath) {
                // Rolldown owns the dynamic graph edge; SystemJS owns loading the emitted capsule at runtime.
                if (!types.isStringLiteral(importPath.node.source)) {
                    throw new Error(`Expected a literal module import in ${fileName}`)
                }

                // Resolve the final relative chunk reference before converting it to the canonical vpt:/ module URL.
                const chunkId = path.posix.join(path.posix.dirname(fileName), importPath.node.source.value)
                importPath.replaceWith(
                    types.callExpression(
                        types.memberExpression(
                            types.memberExpression(types.identifier('global'), types.identifier('System')),
                            types.identifier('import')
                        ),
                        [types.stringLiteral(chunkIdToModuleUrl(chunkId))]
                    )
                )
            }
        }
    }
}
