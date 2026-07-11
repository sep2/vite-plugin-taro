import react from '@vitejs/plugin-react'
import type { Plugin, PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../options.ts'
import { BuildContext } from './build-context.ts'
import { createConditionalDirectivePlugin } from './plugins/conditional-directives.ts'
import { createH5TargetPlugins } from './targets/h5/plugin.ts'
import { createH5ViteConfig } from './targets/h5/vite-config.ts'
import { createWxTargetPlugins } from './targets/wx/plugin.ts'
import { createWxViteConfig } from './targets/wx/vite-config.ts'

/** Creates the Vite plugins for the selected Taro target. */
export default function vitePluginTaro(options: VitePluginTaroOptions): PluginOption[] {
    const context = new BuildContext(options)
    const targetPlugins =
        context.project.target === 'wx' ? createWxTargetPlugins(context) : createH5TargetPlugins(context)

    return [
        createBuildCoordinator(context),
        createConditionalDirectivePlugin(context),
        context.css.plugin,
        ...react(),
        ...targetPlugins
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
