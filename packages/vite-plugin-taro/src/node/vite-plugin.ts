import react from '@vitejs/plugin-react'
import type { Plugin, PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../options.ts'
import { BuildContext } from './build-context.ts'
import { createConditionalDirectivePlugin } from './plugins/conditional-directives.ts'
import { createTaroRuntimePlugin } from './plugins/taro-runtime.ts'
import { createH5TargetPlugins, createH5ViteConfig } from './targets/h5/plugin.ts'
import { createWxTargetPlugins, createWxViteConfig } from './targets/wx/plugin.ts'

/** Creates the Vite plugins for the selected Taro target. */
export default function vitePluginTaro(options: VitePluginTaroOptions): PluginOption[] {
    const context = new BuildContext(options)

    return [
        createBuildCoordinator(context),
        createConditionalDirectivePlugin(context),
        createTaroRuntimePlugin(),
        ...context.css.plugins,
        ...react(),
        ...(context.project.target === 'wx' ? createWxTargetPlugins(context) : []),
        ...(context.project.target === 'h5' ? createH5TargetPlugins(context) : [])
    ]
}

/** Establishes build mode and resolved Vite state before target hooks consume the context. */
function createBuildCoordinator(context: BuildContext): Plugin {
    return {
        name: 'vite-plugin-taro:build',
        enforce: 'pre',

        config(_, environment) {
            context.configure(environment)
            return context.project.target === 'wx' ? createWxViteConfig(context) : createH5ViteConfig(context)
        },

        configResolved(config) {
            context.resolve(config)
        }
    }
}
