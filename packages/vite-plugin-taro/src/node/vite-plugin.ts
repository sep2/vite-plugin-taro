import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../options.ts'
import { createClientTaroPlugin } from './plugins/client/client-taro.ts'
import { createConditionalDirectivePlugin } from './plugins/conditional/conditional-directives.ts'
import { CssPipeline } from './plugins/css/css-pipeline.ts'
import { createH5TargetPlugins } from './plugins/h5/plugins.ts'
import { createWxTargetPlugins } from './plugins/wx/plugins.ts'

/** Creates the Vite plugins for one Taro target. */
export default function vitePluginTaro(options: VitePluginTaroOptions): PluginOption[] {
    const cssPipeline = new CssPipeline(options.target)

    return [
        createConditionalDirectivePlugin(options.target),
        createClientTaroPlugin(),
        ...cssPipeline.plugins,
        ...react(),
        ...(options.target === 'wx' ? createWxTargetPlugins(options, cssPipeline) : []),
        ...(options.target === 'h5' ? createH5TargetPlugins(options) : [])
    ]
}
