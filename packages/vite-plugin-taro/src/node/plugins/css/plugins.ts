import type { Plugin, PluginOption, Rolldown } from 'vite'
import { createContext } from 'weapp-tailwindcss/core'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import type { VitePluginTaroTarget } from '../../../options.ts'

// Keep the Vite plugin and the compatibility finalizer on identical WX conversion settings. A difference here can
// make the second pass preserve browser units or apply a transformation that the first pass did not expect.
const wxStyleOptions = {
    cssCalc: false,
    autoprefixer: false,
    rem2rpx: true,
    px2rpx: true
} as const

/** Creates the target-aware Tailwind CSS plugins. */
export function createCssPlugins(target: VitePluginTaroTarget): PluginOption[] {
    const wx = target === 'wx'

    return [
        ...(WeappTailwindcss({
            appType: 'weapp-vite',
            // WX must enable this for split Tailwind imports such as `tailwindcss/theme.css`. Otherwise Vite's
            // PostCSS resolver tries to resolve those imports from the application and fails when Tailwind is owned
            // by vite-plugin-taro. The web generator consumes the imports before that resolver runs, so H5 keeps the
            // upstream default.
            rewriteCssImports: wx,
            generator: {
                target: wx ? 'weapp' : 'web'
                // webCompat: {
                //     preset: 'legacy-web'
                // }
            },
            cssOptions: {
                ...wxStyleOptions,
                autoprefixer: !wx
            },
            logLevel: 'warn'
        }) ?? []),
        wx ? createWxssCompatibilityFinalizer() : undefined
    ]
}

/**
 * Completes WXSS adaptation that weapp-tailwindcss leaves pending after rewriting split Tailwind imports.
 *
 * In weapp-tailwindcss 5.1.16, `rewriteCssImports: true` makes its early Vite transform generate the Tailwind CSS,
 * but the non-web generator also enables `deferCssAdaptation`. The generated asset is consequently browser-shaped
 * CSS containing values and syntax such as `rem`, escaped class selectors, and `@property`. It is then recorded as a
 * processed Vite asset, so the upstream output finalizer does not perform the missing complete WXSS adaptation.
 *
 * This plugin is appended after the upstream plugin list and repeats only the compatibility transform on final WXSS
 * assets. It does not scan candidates or generate Tailwind utilities. Remove it when upstream stops deferring CSS
 * adaptation for the mini-program `rewriteCssImports` path.
 */
function createWxssCompatibilityFinalizer(): Plugin {
    const context = createContext({
        appType: 'weapp-vite',
        generator: {
            target: 'weapp'
        },
        ...wxStyleOptions,
        logLevel: 'silent'
    })

    return {
        name: 'vite-plugin-taro:wxss-compatibility-finalizer',
        enforce: 'post',
        generateBundle: {
            order: 'post',
            async handler(_, bundle) {
                // Both finalizers use a post-ordered generateBundle hook. Array order places this hook after the
                // upstream finalizer, where every Vite-produced WXSS asset has its final contents and filename.
                await Promise.all(
                    Object.values(bundle)
                        .filter(isWxssAsset)
                        .map(async (asset) => {
                            // Process every Vite-produced WXSS asset visible in this hook rather than coupling the
                            // workaround to `app.wxss`; non-style assets remain outside this compatibility pass.
                            const source =
                                typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source)

                            asset.source = (await context.transformWxss(source)).css
                        })
                )
            }
        }
    }
}

function isWxssAsset(output: Rolldown.OutputAsset | Rolldown.OutputChunk): output is Rolldown.OutputAsset {
    return output.type === 'asset' && output.fileName.endsWith('.wxss')
}
