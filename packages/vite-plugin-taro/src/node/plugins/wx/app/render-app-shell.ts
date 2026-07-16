import path from 'node:path'
import { type PluginObject, type PluginTarget, transformSync, types } from '@babel/core'
import type { Rolldown } from 'vite'
import { chunkIdToModuleUrl } from '../transport/module-url.ts'

const nativeRequirePlaceholder = '__VITE_PLUGIN_TARO_NATIVE_REQUIRE__'

/** Renders the native App shell. */
export function renderAppShell(code: string, fileName: string): { code: string; map: Rolldown.ExistingRawSourceMap } {
    if (!code.includes(nativeRequirePlaceholder)) {
        throw new Error(`Expected native require placeholder in ${fileName}`)
    }

    const appShell = transformSync(code, {
        babelrc: false,
        compact: true,
        configFile: false,
        filename: fileName,
        plugins: [nativeAppShellPlugin(fileName) as PluginTarget],
        sourceFileName: fileName,
        sourceMaps: true,
        sourceType: 'script'
    })
    if (!appShell?.code || !appShell.map) {
        throw new Error(`Failed to render App shell ${fileName}`)
    }

    return {
        code: appShell.code,
        map: appShell.map as Rolldown.ExistingRawSourceMap
    }
}

/** Creates the native App shell rewrite plugin. */
function nativeAppShellPlugin(fileName: string): PluginObject {
    return {
        name: 'vite-plugin-taro:native-app-shell',
        visitor: {
            Identifier(identifierPath) {
                if (identifierPath.node.name === nativeRequirePlaceholder) {
                    identifierPath.node.name = 'require'
                }
            },
            ImportExpression(importPath) {
                if (!types.isStringLiteral(importPath.node.source)) {
                    throw new Error(`Expected a literal App module import in ${fileName}`)
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
