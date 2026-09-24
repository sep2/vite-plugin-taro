import type { RolldownPluginOption } from 'rolldown'
import { viteTransformPlugin } from 'rolldown/experimental'
import type { DevEnvironment } from 'vite'

type TransformConfig = Pick<DevEnvironment['config'], 'root' | 'tsconfig' | 'consumer' | 'oxc'>

/** Reconstructs Vite's native transform through its exported factory, without reading or mutating builtin internals. */
export async function replaceViteTransformPlugin(
    pluginOption: RolldownPluginOption,
    config: TransformConfig
): Promise<RolldownPluginOption> {
    if (config.oxc === false) {
        return pluginOption
    }
    const plugin = await pluginOption
    if (Array.isArray(plugin)) {
        // Return the entire plugin tree in its original order, not just the replacement. Each recursive call preserves
        // nonmatching options by identity; Promise.all also retains the positions of asynchronously resolved plugins.
        return Promise.all(plugin.map((option) => replaceViteTransformPlugin(option, config)))
    }
    if (!plugin || !('name' in plugin) || plugin.name !== 'builtin:vite-transform') {
        return plugin
    }

    const { jsxInject, include, exclude, jsxRefreshInclude, jsxRefreshExclude, ...transformOptions } = config.oxc
    // Match Vite's bundled-environment defaults; the resolved Oxc configuration owns all other transform behavior.
    // The exported native factory still handles tsconfig, JSX refresh filtering, and server-consumer semantics.
    return viteTransformPlugin({
        root: config.root,
        tsconfig: config.tsconfig,
        include: include ?? /\.(m?ts|[jt]sx)$/,
        exclude: exclude ?? /\.js$/,
        jsxRefreshInclude,
        jsxRefreshExclude,
        isServerConsumer: config.consumer === 'server',
        jsxInject,
        // Disable intermediate maps so Oxc does not allocate maps that final native output always discards.
        // A fresh options object replaces the old private-field mutation without changing Vite's retained configuration.
        transformOptions: { ...transformOptions, sourcemap: false }
    })
}
