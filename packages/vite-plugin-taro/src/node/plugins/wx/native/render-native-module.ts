import path from 'node:path'
import { type PluginObject, type PluginTarget, transformSync, types } from '@babel/core'
import transformModulesCommonjs from '@babel/plugin-transform-modules-commonjs'
import type { Rolldown } from 'vite'
import { chunkIdToModuleUrl } from '../../../utils/modules.ts'

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
            },

            MemberExpression(memberPath) {
                const { object, property, computed } = memberPath.node
                if (
                    computed ||
                    !types.isMetaProperty(object) ||
                    !types.isIdentifier(object.meta, { name: 'import' }) ||
                    !types.isIdentifier(object.property, { name: 'meta' }) ||
                    !types.isIdentifier(property, { name: 'url' })
                ) {
                    return
                }

                // WeChat CommonJS has no import.meta. Give native modules the same canonical identity SystemJS uses.
                memberPath.replaceWith(types.stringLiteral(chunkIdToModuleUrl(fileName)))
            }
        }
    }
}
