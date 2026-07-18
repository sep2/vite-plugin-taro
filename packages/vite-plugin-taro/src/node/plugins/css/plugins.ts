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
    const wxStyleAsset = wx ? createWxStyleAssetCapture() : undefined

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
            // The adapter can replace Rolldown's `app.wxss` filename with a source-relative path such as
            // `src/app.wxss`. Capture that exact mutation here so the finalizer can restore only the global asset.
            onUpdate: wxStyleAsset?.capture,
            logLevel: 'warn'
        }) ?? []),
        wxStyleAsset ? createWxssCompatibilityFinalizer(wxStyleAsset.get) : undefined
    ]
}

/**
 * Captures the global style path from the Tailwind adapter's own mutation callback.
 *
 * Rolldown reconstructs output objects between plugin hooks in bundled development, so object identity cannot correlate
 * the asset across hooks. The callback path remains stable. With `cssCodeSplit: false`, Tailwind reports one global style,
 * while native Page companions are emitted later by the wx plugin and never pass through this callback.
 */
function createWxStyleAssetCapture(): { capture(fileName: string): void; get(): string | undefined } {
    let styleFileName: string | undefined

    return {
        capture(fileName) {
            const normalized = fileName.replaceAll('\\', '/')
            if (normalized.endsWith('.css') || normalized.endsWith('.wxss')) styleFileName = normalized
        },
        get() {
            return styleFileName
        }
    }
}

/**
 * Completes WXSS adaptation that weapp-tailwindcss leaves pending after rewriting split Tailwind imports.
 *
 * In weapp-tailwindcss 5.1.16, `rewriteCssImports: true` makes its early Vite transform generate the Tailwind CSS,
 * but the non-web generator also enables `deferCssAdaptation`. The generated asset is consequently browser-shaped
 * CSS containing values and syntax such as `rem`, escaped class selectors, and `@property`. It is then recorded as a
 * processed Vite asset, so the upstream output finalizer does not perform the missing complete WXSS adaptation.
 *
 * This plugin runs after the upstream finalizer, repeats only the compatibility transform, and restores the captured
 * global asset to WeChat's required `app.wxss` path. Exact path correlation leaves Page WXSS companions untouched.
 * Remove it when upstream both completes adaptation and preserves the bundler-selected filename.
 */
function createWxssCompatibilityFinalizer(getStyleFileName: () => string | undefined): Plugin {
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
                const styleFileName = getStyleFileName()
                const styleAsset = styleFileName
                    ? Object.values(bundle).find(
                          (output): output is Rolldown.OutputAsset =>
                              output.type === 'asset' && output.fileName.replaceAll('\\', '/') === styleFileName
                      )
                    : undefined
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
                // Rename only the path reported by Tailwind; never infer the global asset from all final `.wxss` files.
                if (styleAsset) styleAsset.fileName = 'app.wxss'
            }
        }
    }
}

function isWxssAsset(output: Rolldown.OutputAsset | Rolldown.OutputChunk): output is Rolldown.OutputAsset {
    return output.type === 'asset' && output.fileName.endsWith('.wxss')
}
