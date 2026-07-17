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
        plugins: [connectNativeImportPlugin(chunk.fileName) as PluginTarget, transformModulesCommonjs as PluginTarget],
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

/**
 * Preserves Rolldown's ESM graph while adapting its final native chunks to WeChat's synchronous CommonJS runtime.
 * Application chunks remain asynchronous SystemJS capsules, so native dynamic imports must cross that boundary explicitly.
 */
function connectNativeImportPlugin(fileName: string): PluginObject {
    return {
        name: 'vite-plugin-taro:connect-native-import',
        visitor: {
            Identifier(identifierPath) {
                // Keep transport outside Rolldown's graph, then restore native require only after chunking is complete.
                if (identifierPath.node.name === nativeRequirePlaceholder) {
                    identifierPath.node.name = 'require'
                }
            },

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
                            types.memberExpression(types.identifier('globalThis'), types.identifier('System')),
                            types.identifier('import')
                        ),
                        [types.stringLiteral(chunkIdToModuleUrl(chunkId))]
                    )
                )
            }
        }
    }
}
