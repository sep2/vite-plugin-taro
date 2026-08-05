import path from 'node:path'
import type { Plugin, PluginOption, Rolldown } from 'vite'
import { createContext } from 'weapp-tailwindcss/core'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import type { VitePluginTaroTarget } from '../../../options.ts'
import { packageRequire } from '../../utils/packages.ts'

// Keep the Vite plugin and the compatibility finalizer on identical WX conversion settings. A difference here can
// make the second pass preserve browser units or apply a transformation that the first pass did not expect.
const tailwindcssBasedir = path.dirname(packageRequire.resolve('tailwindcss/package.json'))

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
            // Tailwind is a plugin dependency, not an application dependency. Give weapp-tailwindcss the owning package
            // directory explicitly so bundled development and strict package managers resolve split CSS imports equally.
            tailwindcssBasedir,
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
 * `rewriteCssImports: true` makes the early Vite transform generate the Tailwind CSS, but the non-web generator
 * also defers CSS adaptation. The generated asset is consequently browser-shaped
 * CSS containing values and syntax such as `rem`, escaped class selectors, and `@property`. It is then recorded as a
 * processed Vite asset, so the upstream output finalizer does not perform the missing complete WXSS adaptation.
 *
 * This plugin runs after the upstream finalizer, repeats only the compatibility transform, and restores the captured
 * global asset to WeChat's required `app.wxss` path. Exact path correlation leaves Page WXSS companions untouched.
 * Remove it when upstream both completes adaptation and preserves the bundler-selected filename.
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
                // With cssCodeSplit: false the global style is the only asset with a logical
                // .css source name, even when an earlier hook already changed its final suffix.
                const globalStyleAsset = Object.values(bundle).find(
                    (output): output is Rolldown.OutputAsset =>
                        output.type === 'asset' &&
                        (output.fileName.replaceAll('\\', '/').endsWith('.css') ||
                            output.names.some((name) => name.replaceAll('\\', '/').endsWith('.css')))
                )
                // Both finalizers use a post-ordered generateBundle hook. Array order places this hook after the
                // upstream finalizer, where every Vite-produced style asset has its final contents and filename.
                await Promise.all(
                    Object.values(bundle)
                        .filter(isStyleAsset)
                        .map(async (asset) => {
                            // Transform every style asset visible in this hook — the global
                            // style (browser-shaped, skipped by upstream) and the .wxss page
                            // companions; non-style assets remain outside this compatibility pass.
                            const source =
                                typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source)

                            asset.source = (await context.transformWxss(source)).css
                        })
                )
                if (globalStyleAsset) globalStyleAsset.fileName = 'app.wxss'
            }
        }
    }
}

function isStyleAsset(output: Rolldown.OutputAsset | Rolldown.OutputChunk): output is Rolldown.OutputAsset {
    return output.type === 'asset' && (output.fileName.endsWith('.css') || output.fileName.endsWith('.wxss'))
}
