import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../options.ts'
import { createBuildContext } from './context.ts'
import { createTaroCssIntegration } from './css-integration.ts'
import { createVitePluginTaroConditionalDirectivePlugin } from './plugins/conditional-directives.ts'
import { createH5TargetPlugins } from './targets/h5/plugin.ts'
import { createWxTargetPlugins } from './targets/wx/plugin.ts'

/** Creates the Vite plugins for the selected Taro target. */
export default function vitePluginTaro(options: VitePluginTaroOptions): PluginOption[] {
    const context = createBuildContext(options)
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
