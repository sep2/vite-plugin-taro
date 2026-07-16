import { type PluginObject, transformSync } from '@babel/core'
import type { Rolldown } from 'vite'

const nativeRequirePlaceholder = '__VITE_PLUGIN_TARO_NATIVE_REQUIRE__'

/** Renders the native bootstrap with its native require restored. */
export function renderBootstrap(code: string, fileName: string): { code: string; map: Rolldown.ExistingRawSourceMap } {
    if (!code.includes(nativeRequirePlaceholder)) {
        throw new Error(`Expected native require placeholder in ${fileName}`)
    }

    const bootstrap = transformSync(code, {
        babelrc: false,
        compact: true,
        configFile: false,
        filename: fileName,
        plugins: [nativeCommonJsGlobalsPlugin],
        sourceFileName: fileName,
        sourceMaps: true,
        sourceType: 'script'
    })

    if (!bootstrap?.code || !bootstrap.map) {
        throw new Error(`Failed to generate the native bootstrap for ${fileName}`)
    }

    return { code: bootstrap.code, map: bootstrap.map as Rolldown.ExistingRawSourceMap }
}

/** Creates the native-require rewrite plugin. */
function nativeCommonJsGlobalsPlugin(): PluginObject {
    return {
        name: 'vite-plugin-taro:native-commonjs-globals',
        visitor: {
            Identifier(path) {
                if (path.node.name === nativeRequirePlaceholder) path.node.name = 'require'
            }
        }
    }
}
