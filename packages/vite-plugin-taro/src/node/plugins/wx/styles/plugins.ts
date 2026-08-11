import type { Plugin, PluginOption, Rolldown } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import { transformVitePlugin } from '../../../utils/vite.ts'
import { tailwindcssBasedir } from '../../tailwind/tailwind-css.ts'
import { transformWxStyle, wxStyleOptions } from './transform-wx-style.ts'

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

    return [transformVitePlugin(tailwindPlugins, alignGenerateBundleOrder), createWxStyleFinalizer(transformWxStyle)]
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
function createWxStyleFinalizer(transformStyle: typeof transformWxStyle): Plugin {
    /*
     * DevEngine can omit an unchanged stylesheet from later complete output generations. Absence therefore has two meanings:
     * the first clean output genuinely has no styles, or a later output is reusing the physical stylesheet already on disk.
     * The Vite server creates a fresh plugin instance on a clean start, so this one lifecycle bit distinguishes those cases and
     * resets naturally on restart. Deliberately retain no CSS bytes or graph projection here: memory remains O(1), changed CSS
     * still arrives as a normal asset, and the dev host remains the only owner of incremental style preparation.
     */
    let hasFinalizedOutput = false

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
                    /*
                     * A clean first output must materialize the stable import target imported by app.wxss. On later complete
                     * outputs, DevEngine's physical writer preserves files omitted from the bundle; emitting the same empty
                     * placeholder would instead overwrite valid unchanged WXSS. Emit nothing in that later case. A source or
                     * configuration change that really removes all styles is already published as empty by ordinary style HMR,
                     * while a clean server restart reaches this first-output branch and also clears any stale prior file.
                     */
                    if (!hasFinalizedOutput) {
                        this.emitFile({ type: 'asset', fileName: 'assets/global.wxss', source: '' })
                    }
                    hasFinalizedOutput = true
                    return
                }

                const [style] = styles
                const source = typeof style.source === 'string' ? style.source : new TextDecoder().decode(style.source)
                const transformedResult = await transformStyle(source)

                // Preserve the compiler stylesheet as the real global asset so its bundle metadata and ownership remain
                // intact. Only its finalized contents and stable WXSS identity change.
                style.source = transformedResult.css
                style.fileName = 'assets/global.wxss'
                hasFinalizedOutput = true
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
