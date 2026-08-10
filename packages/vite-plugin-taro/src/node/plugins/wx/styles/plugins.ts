import { createStyleHandler } from '@weapp-tailwindcss/postcss'
import type { Plugin, PluginOption, Rolldown } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import { tailwindcssBasedir } from '../../tailwind/tailwind-css.ts'

/*
 * WX style output order:
 *
 *   weapp-tailwindcss output hooks
 *       → vpt:wx-style-finalizer
 *       → vpt:wx native companion emission
 *
 * All three generateBundle hooks retain hook-level `order: 'post'` and therefore execute in registration order. The
 * upstream plugin normally also uses plugin-level `enforce: 'post'`, which would move it behind both VPT plugins and
 * break this sequence. `alignGenerateBundleOrder` removes only that broader phase from upstream output hooks.
 */

// Both upstream generation and VPT's final whole-file pass use one conversion policy. If these options diverge, the
// second pass can preserve browser units or reinterpret syntax that the first pass generated.
const wxStyleOptions = {
    cssCalc: false,
    autoprefixer: false,
    rem2rpx: true,
    px2rpx: true
} as const

/** Creates the complete WX Tailwind and global-style pipeline. */
export function createWxStylePlugins(): PluginOption[] {
    const tailwindPlugins =
        WeappTailwindcss({
            // VPT is a custom Vite compiler.
            // Using Taro's adapter would import Taro-specific CSS ownership rules which we don't need.
            appType: 'weapp-vite',
            // WX generation rewrites Tailwind's split package imports before Vite tries to resolve them in the app.
            // Without this, strict workspaces fail on imports such as `tailwindcss/theme.css`.
            rewriteCssImports: true,
            platform: 'weapp',
            tailwindcssBasedir,
            generator: {
                target: 'weapp'
            },
            cssOptions: wxStyleOptions,
            logLevel: 'warn'
        }) ?? []

    return [...tailwindPlugins.map(alignGenerateBundleOrder), createWxStyleFinalizer()]
}

/**
 * Finalizes the one global stylesheet after upstream Tailwind generation.
 *
 * `cssCodeSplit: false` makes the compiler style global, but upstream can name it `.css` or `.wxss` depending on build
 * mode. This hook converts its complete final contents once, renames that compiler asset to `assets/global.wxss`, and
 * emits the root `app.wxss` wrapper that imports it. Running earlier loses CSS from dynamic chunks; running after native
 * companion emission would also see Page and native-component WXSS files that must remain opaque.
 */
function createWxStyleFinalizer(): Plugin {
    // The handler is immutable and reusable across builds; only each emitted asset's source is replaced.
    const transformWxStyle = createStyleHandler(wxStyleOptions)

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
                const transformedResult = await transformWxStyle(source)

                // Preserve the compiler stylesheet as the real global asset so its bundle metadata and ownership remain
                // intact. Only its finalized contents and stable WXSS identity change.
                style.source = transformedResult.css
                style.fileName = 'assets/global.wxss'

                // app.wxss is a generated native entrypoint whose content and path are identical in every WX build.
                this.emitFile({ type: 'asset', fileName: 'app.wxss', source: '@import "./assets/global.wxss";\n' })
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
 * tie-breaker between upstream generation, VPT finalization and native output.
 */
function alignGenerateBundleOrder(pluginOption: PluginOption): PluginOption {
    // PluginOption permits nested arrays. Preserve their shape while adapting every concrete plugin recursively.
    if (Array.isArray(pluginOption)) return pluginOption.map(alignGenerateBundleOrder)

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
