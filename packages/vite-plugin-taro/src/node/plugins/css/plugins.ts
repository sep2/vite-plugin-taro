import path from 'node:path'
import { createStyleHandler } from '@weapp-tailwindcss/postcss'
import type { Plugin, PluginOption, Rolldown } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import type { VitePluginTaroTarget } from '../../../options.ts'
import { packageRequire } from '../../utils/packages.ts'

/*
 * CSS output order for WX:
 *
 *   weapp-tailwindcss output hooks
 *       → vpt:wx-style-finalizer
 *       → vpt:wx native companion emission
 *
 * All three generateBundle hooks retain hook-level `order: 'post'` and therefore execute in registration order. The
 * upstream plugin normally also uses plugin-level `enforce: 'post'`, which would move it behind both VPT plugins and
 * break this sequence. `alignWxGenerateBundleOrder` removes only that broader phase from upstream output hooks.
 */

// Tailwind belongs to VPT, not necessarily to the application. Resolving from VPT keeps strict package managers and
// bundled development from looking for Tailwind in the application's node_modules.
const tailwindcssBasedir = path.dirname(packageRequire.resolve('tailwindcss/package.json'))

// Both upstream generation and VPT's final whole-file pass use one conversion policy. If these options diverge, the
// second pass can preserve browser units or reinterpret syntax that the first pass generated.
const wxStyleOptions = {
    cssCalc: false,
    autoprefixer: false,
    rem2rpx: true,
    px2rpx: true
} as const

// The handler is immutable and reusable across builds; only each emitted asset's source is replaced.
const transformWxStyle = createStyleHandler(wxStyleOptions)

/** Creates the target-aware Tailwind pipeline. */
export function createCssPlugins(target: VitePluginTaroTarget): PluginOption[] {
    const wx = target === 'wx'

    const tailwindPlugins =
        WeappTailwindcss({
            // VPT is a custom Vite compiler. Using Taro's adapter would import Taro-specific CSS ownership rules.
            appType: 'weapp-vite',
            // WX generation rewrites Tailwind's split package imports before Vite tries to resolve them in the app.
            // Without this, strict workspaces fail on imports such as `tailwindcss/theme.css`.
            rewriteCssImports: wx,
            platform: wx ? 'weapp' : 'web',
            tailwindcssBasedir,
            generator: {
                target: wx ? 'weapp' : 'web'
            },
            cssOptions: {
                ...wxStyleOptions,
                // Browser output still needs vendor prefixes; WXSS does not support or need that browser pass.
                autoprefixer: !wx
            },
            logLevel: 'warn'
        }) ?? []

    return [
        ...(wx ? tailwindPlugins.map(alignWxGenerateBundleOrder) : tailwindPlugins),
        wx ? createWxStyleFinalizer() : undefined
    ]
}

/**
 * Finalizes the one global stylesheet after upstream Tailwind generation.
 *
 * `cssCodeSplit: false` makes the compiler style global, but upstream can name it `.css` or `.wxss` depending on build
 * mode. This hook converts its complete final contents once and gives it the root `app.wxss` identity required by
 * WeChat. Running earlier loses CSS from dynamic chunks; running after native companion emission would also see Page
 * and native-component WXSS files that must remain opaque.
 */
function createWxStyleFinalizer(): Plugin {
    return {
        name: 'vpt:wx-style-finalizer',
        generateBundle: {
            order: 'post',
            async handler(_, bundle) {
                const styles = Object.values(bundle).filter(isStyleAsset)
                // More than one compiler style means cssCodeSplit was re-enabled. Choosing one would silently lose CSS.
                if (styles.length > 1) {
                    throw new Error('WX builds require one global compiler-emitted stylesheet')
                }
                // CSS is optional; applications without styles do not need an empty app.wxss.
                if (styles.length === 0) return

                const [style] = styles
                const source = typeof style.source === 'string' ? style.source : new TextDecoder().decode(style.source)
                // generateBundle exposes the final asset as mutable so conversion and native placement remain atomic.
                // Without the compatibility pass, browser-only selectors, escaped classes, rem and @property can reach
                // WeChat. Without the rename, bundled development writes paths such as src/app.wxss, which WeChat does
                // not load as the application's global stylesheet.
                style.source = (await transformWxStyle(source)).css
                style.fileName = 'app.wxss'
            }
        }
    }
}

/**
 * Adapts upstream plugin descriptors without mutating `weapp-tailwindcss` or patching node_modules.
 *
 * Vite first groups whole plugins by `enforce`, then orders individual hooks. Upstream's output plugins specify both
 * `enforce: 'post'` and `generateBundle.order: 'post'`. The plugin-level phase overrides their earlier registration and
 * places them after VPT's normal plugins, so VPT observes incomplete CSS. Making all of VPT post-enforced would fix that
 * one hook while unnecessarily reordering resolution and transforms.
 *
 * For upstream plugins that actually own generateBundle, clone the descriptor without plugin-level enforcement. Keep
 * hook-level `order: 'post'`: it still waits for ordinary bundle generation, while registration order becomes the sole
 * tie-breaker between upstream generation, VPT finalization and native output. H5 descriptors remain untouched.
 */
function alignWxGenerateBundleOrder(pluginOption: PluginOption): PluginOption {
    // PluginOption permits nested arrays. Preserve their shape while adapting every concrete plugin recursively.
    if (Array.isArray(pluginOption)) return pluginOption.map(alignWxGenerateBundleOrder)

    if (
        !pluginOption ||
        typeof pluginOption !== 'object' ||
        !('enforce' in pluginOption) ||
        pluginOption.enforce !== 'post' ||
        !('generateBundle' in pluginOption) ||
        pluginOption.generateBundle === undefined
    ) {
        return pluginOption
    }

    // Clone rather than mutate: upstream may retain or reuse the descriptor returned by its factory.
    return { ...pluginOption, enforce: undefined }
}

/** Selects only the compiler stylesheet; native WXSS assets are emitted by the later WX hook. */
function isStyleAsset(output: Rolldown.OutputBundle[string]): output is Rolldown.OutputAsset {
    return output.type === 'asset' && /\.(?:css|wxss)$/.test(output.fileName)
}
