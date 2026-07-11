import path from 'node:path'
import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'
import { createVitePluginTaroConditionalDirectivePlugin } from './plugins/conditional-directive-plugin.ts'
import { createH5TargetPlugins } from './targets/h5.ts'
import { createWxTargetPlugins } from './targets/wx.ts'
import { createTaroCssIntegration } from './taro-css.ts'
import type { VitePluginTaroBuildContext, VitePluginTaroOptions } from './types.ts'

/** Creates the Vite plugins for the selected Taro target. */
export default function vitePluginTaro(options: VitePluginTaroOptions): PluginOption[] {
    const context = createVitePluginTaroBuildContext(options)
    const css = createTaroCssIntegration(context)

    return [
        createVitePluginTaroConditionalDirectivePlugin(context),
        css.plugin,
        ...react(),
        ...(context.target === 'wx'
            ? createWxTargetPlugins(context, css.transformWxRuntimeClassNames)
            : createH5TargetPlugins(context))
    ]
}

/** Normalizes user options into data shared by the target plugins. */
function createVitePluginTaroBuildContext(options: VitePluginTaroOptions): VitePluginTaroBuildContext {
    return {
        target: options.target,
        appComponentFile: path.resolve(options.app),
        pages: options.pages,
        appConfig: {
            ...options.appJson,
            pages: options.pages.map((page) => page.path)
        },
        projectConfigJson: options.projectConfigJson,
        projectPrivateConfigJson: options.projectPrivateConfigJson,
        sitemapJson: options.sitemapJson
    }
}
