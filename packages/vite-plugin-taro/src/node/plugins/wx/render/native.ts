import { type PluginObject, type PluginTarget, types } from '@babel/core'
import transformModulesCommonjs from '@babel/plugin-transform-modules-commonjs'
import type { Rolldown } from 'vite'
import { resolveChunkReference } from '../../../utils/modules.ts'
import { type AstTransformResult, transformWithBabel } from '../../../utils/transform.ts'

/** Renders a synchronous native module. */
export function renderNative(code: string, chunk: Rolldown.RenderedChunk, sourcemap = true): AstTransformResult {
    return transformWithBabel(
        code,
        chunk.fileName,
        [connectNativeImportPlugin(chunk.fileName) as PluginTarget, transformModulesCommonjs as PluginTarget],
        sourcemap
    )
}

/**
 * Preserves Rolldown's ESM graph while adapting its final native chunks to WeChat's synchronous CommonJS runtime.
 * Only a native entry's direct capsule split point reaches this renderer and becomes importSync(). Dynamic imports inside
 * that capsule are rendered separately as System.import(), so their lazy graphs may use subpackages and top-level await.
 */
function connectNativeImportPlugin(fileName: string): PluginObject {
    return {
        name: 'vite-plugin-taro:connect-native-import',
        visitor: {
            ImportExpression(importPath) {
                // In source, import() is only a Rolldown split-point marker for the native entry's capsule. Placement keeps
                // that root and its static closure in main, and importSync rejects top-level await anywhere in that eager
                // closure. Nested dynamic imports cross a new boundary and retain normal asynchronous System.import().
                if (!types.isStringLiteral(importPath.node.source)) {
                    throw new Error(`Expected a literal module import in ${fileName}`)
                }

                // Resolve the final relative reference once at build time; the runtime accepts only canonical chunk IDs.
                const chunkId = resolveChunkReference(fileName, importPath.node.source.value)

                importPath.replaceWith(
                    types.callExpression(
                        types.memberExpression(
                            types.memberExpression(types.identifier('global'), types.identifier('System')),
                            types.identifier('importSync')
                        ),
                        [types.stringLiteral(chunkId)]
                    )
                )
            }
        }
    }
}
