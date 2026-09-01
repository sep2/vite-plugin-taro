import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'
import type { VptOptions } from '../options.ts'
import { createClientTaroPlugin } from './plugins/client/client-taro.ts'
import { createConditionalDirectivePlugin } from './plugins/conditional/conditional-directives.ts'
import { createH5TargetPlugins } from './plugins/h5/plugins.ts'
import { createWxMiniPlugins } from './plugins/wx/plugins.ts'

/** Creates the Vite plugins for one Taro target. */
export default function vpt(options: VptOptions): PluginOption[] {
    return [
        createConditionalDirectivePlugin(options.target),
        createClientTaroPlugin(options.target),
        ...react(),
        ...(options.target === 'wx' ? createWxMiniPlugins(options) : []),
        ...(options.target === 'h5' ? createH5TargetPlugins(options) : [])
    ]
}
