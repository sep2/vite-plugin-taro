import type { Plugin, PluginOption } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { transformVitePlugin, wrapPluginTransform } from '../../../utils/vite.ts'

const tailwindGenerateServePluginName = 'weapp-tailwindcss:adaptor:generate:serve'

type TailwindRootTracker = Readonly<{
    plugins: PluginOption[]
    getTailwindRoots: () => ReadonlySet<string>
}>

/**
 * Discovers development Tailwind roots without duplicating Tailwind's directive or source scanning.
 *
 * A JS/TSX class edit updates `weapp-tailwindcss`'s private candidate state, but Rolldown's HMR patch does not transform the
 * unchanged root stylesheet or emit a complete `global.wxss`. Later WX development hooks therefore need the physical root
 * IDs so they can request fresh CSS from the existing Vite/Tailwind pipeline. Upstream already makes the authoritative root
 * decision in its serve generator, but keeps that registry private; this adapter observes only successful results from that
 * generator. The wrapped hook is serve-only, so production continues to use the normal complete bundle stylesheet.
 *
 * Remove this adapter when either `weapp-tailwindcss` exposes a supported API for its generated serve-root IDs, or the WX
 * development compiler itself regenerates the complete global stylesheet after JS/TSX candidate changes. Until one of those
 * owns the missing regeneration step, removing this tracker would make newly added or removed utility classes publish stale
 * `global.wxss` output.
 */
export function createTailwindRootTracker(pluginOptions: PluginOption[]): TailwindRootTracker {
    // The wrapped upstream transform is the sole writer. Keeping this registry mutable lets later WX development hooks
    // observe roots discovered lazily as Rolldown reaches additional entries, while callers receive a read-only view.
    const rootIds = new Set<string>()

    const plugins = transformVitePlugin(pluginOptions, (plugin) => {
        return plugin.name === tailwindGenerateServePluginName ? trackTailwindRoot(plugin, rootIds) : plugin
    })

    return {
        plugins,
        getTailwindRoots: () => {
            return rootIds
        }
    }
}

function trackTailwindRoot(plugin: Plugin, rootIds: Set<string>): Plugin {
    return wrapPluginTransform(plugin, (transform) => {
        return async function (code, id, meta) {
            const result = await transform.call(this, code, id, meta)

            // A result is the upstream generator's authoritative confirmation that this style owns Tailwind output.
            if (result !== null && result !== undefined) {
                rootIds.add(normalizeModuleId(id))
            }

            return result
        }
    })
}
