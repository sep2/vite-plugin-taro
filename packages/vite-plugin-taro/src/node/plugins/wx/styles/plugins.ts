import { createStyleHandler } from '@weapp-tailwindcss/postcss'
import type { Plugin, PluginOption, Rolldown } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import { transformVitePlugin } from '../../../utils/vite.ts'
import { tailwindcssBasedir } from '../../tailwind/tailwind-css.ts'
import { createTailwindRootTracker } from './create-tailwind-root-tracker.ts'
import { createWxDevStyle } from './create-wx-dev-style.ts'

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
    const { plugins: tailwindPlugins, getTailwindRoots } = createTailwindRootTracker(
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
    )

    return [
        transformVitePlugin(tailwindPlugins, alignGenerateBundleOrder),
        createWxDevStyle(getTailwindRoots),
        createWxStyleFinalizer()
    ]
}

/**
 * Finalizes the one global stylesheet after upstream Tailwind generation.
 *
 * `cssCodeSplit: false` makes the compiler style global, but upstream can name it `.css` or `.wxss` depending on build
 * mode. This hook converts its complete final contents once and renames that compiler asset to `assets/global.wxss`. An
 * application without styles receives an empty global asset at the same stable path. Running earlier loses CSS from
 * dynamic chunks; running after native companion emission would also see Page and native-component WXSS files that must
 * remain opaque.
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

                // Multiple compiler styles mean cssCodeSplit was re-enabled. Choosing one would silently lose CSS.
                if (styles.length > 1) {
                    throw new Error('WX builds support at most one compiler-emitted stylesheet')
                }

                if (styles.length === 0) {
                    this.emitFile({ type: 'asset', fileName: 'assets/global.wxss', source: '' })
                    return
                }

                const [style] = styles
                const source = typeof style.source === 'string' ? style.source : new TextDecoder().decode(style.source)
                const transformedResult = await transformWxStyle(source)

                // Preserve the compiler stylesheet as the real global asset so its bundle metadata and ownership remain
                // intact. Only its finalized contents and stable WXSS identity change.
                style.source = transformedResult.css
                style.fileName = 'assets/global.wxss'
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
function alignGenerateBundleOrder(plugin: Plugin): Plugin {
    if (plugin.enforce !== 'post' || plugin.generateBundle === undefined) {
        return plugin
    }

    // Clone rather than mutate: upstream may retain or reuse the descriptor returned by its factory.
    return { ...plugin, enforce: undefined }
}

/** Selects only the compiler stylesheet; native WXSS assets are emitted by the later WX hook. */
function isStyleAsset(output: Rolldown.OutputBundle[string]): output is Rolldown.OutputAsset {
    return output.type === 'asset' && /\.(?:css|wxss)$/.test(output.fileName)
}
