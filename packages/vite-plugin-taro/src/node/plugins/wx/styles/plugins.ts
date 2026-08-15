import type { Plugin, PluginOption, Rolldown } from 'vite'
import { transformWxStyle } from './transform-wx-style.ts'

/** Creates the complete WX global-style finalizer. */
export function createWxStylePlugins(): PluginOption[] {
    return [createWxStyleFinalizer()]
}

/**
 * Converts the one compiler stylesheet to the stable global WXSS artifact.
 *
 * `cssCodeSplit: false` makes imported application styles global. The later native-output hook emits Page and native-component
 * WXSS files, so this hook sees only the compiler stylesheet and leaves native styles opaque.
 */
function createWxStyleFinalizer(): Plugin {
    return {
        name: 'vpt:wx-style-finalizer',
        generateBundle: {
            order: 'post',
            async handler(_, bundle) {
                const styles = Object.values(bundle).filter(isStyleAsset)

                if (styles.length > 1) {
                    throw new Error('WX builds support at most one compiler-emitted stylesheet')
                }

                const [style] = styles
                if (!style) {
                    this.emitFile({ type: 'asset', fileName: 'assets/global.wxss', source: '' })
                    return
                }

                const source = typeof style.source === 'string' ? style.source : new TextDecoder().decode(style.source)
                const transformedResult = await transformWxStyle(source)

                style.source = transformedResult.css
                style.fileName = 'assets/global.wxss'
            }
        }
    }
}

/** Selects only the compiler stylesheet; native WXSS assets are emitted by the later WX hook. */
function isStyleAsset(output: Rolldown.OutputBundle[string]): output is Rolldown.OutputAsset {
    return output.type === 'asset' && /\.(?:css|wxss)$/.test(output.fileName)
}
