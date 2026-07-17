import path from 'node:path'
import { type PluginObject, type PluginTarget, transformSync, types } from '@babel/core'
import transformModulesCommonjs from '@babel/plugin-transform-modules-commonjs'
import type { Rolldown } from 'vite'
import { chunkIdToModuleUrl } from '../transport/module-url.ts'

const nativeRequirePlaceholder = '__VITE_PLUGIN_TARO_NATIVE_REQUIRE__'

/** Renders a synchronous native module. */
export function renderNativeModule(
    code: string,
    chunk: Rolldown.RenderedChunk
): { code: string; map: Rolldown.ExistingRawSourceMap } {
    const nativeModule = transformSync(code, {
        babelrc: false,
        compact: true,
        configFile: false,
        filename: chunk.fileName,
        plugins: [rewriteNativeModulePlugin(chunk.fileName) as PluginTarget, transformModulesCommonjs as PluginTarget],
        sourceFileName: chunk.fileName,
        sourceMaps: true,
        sourceType: 'module'
    })
    if (!nativeModule?.code || !nativeModule.map) {
        throw new Error(`Failed to render native module ${chunk.fileName}`)
    }

    return {
        code: nativeModule.code,
        map: nativeModule.map as Rolldown.ExistingRawSourceMap
    }
}

/** Creates the syntax rewrites required by synchronous native modules. */
function rewriteNativeModulePlugin(fileName: string): PluginObject {
    return {
        name: 'vite-plugin-taro:rewrite-native-module',
        visitor: {
            Identifier(identifierPath) {
                if (identifierPath.node.name === nativeRequirePlaceholder) {
                    identifierPath.node.name = 'require'
                }
            },

            ImportExpression(importPath) {
                if (!types.isStringLiteral(importPath.node.source)) {
                    throw new Error(`Expected a literal module import in ${fileName}`)
                }

                const chunkId = path.posix.join(path.posix.dirname(fileName), importPath.node.source.value)
                importPath.replaceWith(
                    types.callExpression(
                        types.memberExpression(types.identifier('System'), types.identifier('import')),
                        [types.stringLiteral(chunkIdToModuleUrl(chunkId))]
                    )
                )
            }
        }
    }
}
