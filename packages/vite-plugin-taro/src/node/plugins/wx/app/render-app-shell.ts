import { type PluginObject, transformSync } from '@babel/core'
import type { Rolldown } from 'vite'

const nativeRequirePlaceholder = '__VITE_PLUGIN_TARO_NATIVE_REQUIRE__'

/** Renders the App shell with native require restored. */
export function renderAppShell(code: string, fileName: string): { code: string; map: Rolldown.ExistingRawSourceMap } {
    if (!code.includes(nativeRequirePlaceholder)) {
        throw new Error(`Expected native require placeholder in ${fileName}`)
    }

    const appShell = transformSync(code, {
        babelrc: false,
        compact: true,
        configFile: false,
        filename: fileName,
        plugins: [nativeRequirePlugin],
        sourceFileName: fileName,
        sourceMaps: true,
        sourceType: 'script'
    })
    if (!appShell?.code || !appShell.map) {
        throw new Error(`Failed to render App shell ${fileName}`)
    }

    return { code: appShell.code, map: appShell.map as Rolldown.ExistingRawSourceMap }
}

/** Creates the native require rewrite plugin. */
function nativeRequirePlugin(): PluginObject {
    return {
        name: 'vite-plugin-taro:native-require',
        visitor: {
            Identifier(path) {
                if (path.node.name === nativeRequirePlaceholder) {
                    path.node.name = 'require'
                }
            }
        }
    }
}
