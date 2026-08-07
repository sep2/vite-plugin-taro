import path from 'node:path'
import { createStyleHandler } from '@weapp-tailwindcss/postcss'
import type { Plugin, PluginOption, Rolldown } from 'vite'
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
    // This compatibility pass only needs the PostCSS style pipeline. Creating a complete weapp-tailwindcss context here
    // would initialize another Tailwind compiler and source scanner for CSS that the upstream Vite plugin already generated.
    const transformWxss = createStyleHandler(wxStyleOptions)

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
                if (!globalStyleAsset) return

                // Both finalizers use a post-ordered generateBundle hook. Array order places this hook after the
                // upstream finalizer, where the single Vite global style asset has its final contents and filename.
                const source =
                    typeof globalStyleAsset.source === 'string'
                        ? globalStyleAsset.source
                        : new TextDecoder().decode(globalStyleAsset.source)
                if (source.length > 0) {
                    globalStyleAsset.source = (await transformWxss(source)).css
                }
                globalStyleAsset.fileName = 'app.wxss'
            }
        }
    }
}
