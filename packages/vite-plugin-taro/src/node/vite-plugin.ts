import react from '@vitejs/plugin-react'
import type { Plugin, PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../options.ts'
import { BuildContext } from './build-context.ts'
import { createConditionalDirectivePlugin } from './plugins/conditional-directives.ts'
import { createTaroRuntimePlugin } from './plugins/taro-runtime.ts'
import { createH5TargetPlugins } from './targets/h5/plugin.ts'
import { createWxEnvironmentPlugin } from './wx-environment.ts'

/**
 * Creates the current target-selected plugin API while allowing WX internals to use the new dedicated environment.
 * Shared source transforms remain common, then exactly one target pipeline is installed from `options.target`.
 */
export default function vitePluginTaro(options: VitePluginTaroOptions): PluginOption[] {
    const context = new BuildContext(options)

    return [
        createBuildCoordinator(context),
        createConditionalDirectivePlugin(context),
        createTaroRuntimePlugin(),
        ...react(),
        ...(context.project.target === 'wx' ? [createWxEnvironmentPlugin(context)] : []),
        ...(context.project.target === 'h5' ? createH5TargetPlugins(context) : [])
    ]
}

/**
 * Initializes shared lifecycle state before H5 or WX config hooks read mode-sensitive values.
 * The pre hook makes configuration order deterministic while BuildContext permits Vite's repeated same-lifecycle resolution.
 */
function createBuildCoordinator(context: BuildContext): Plugin {
    return {
        name: 'vite-plugin-taro:build',
        enforce: 'pre',

        config(_, environment) {
            context.configure(environment)
        }
    }
}
