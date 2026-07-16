import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../options.ts'
import { createClientTaroPlugin } from './plugins/client-taro.ts'
import { createWxTargetPlugins } from './plugins/wx/plugins.ts'

/** Creates the Vite plugins for one Taro target. */
export default function vitePluginTaro(options: VitePluginTaroOptions): PluginOption[] {
    return [createClientTaroPlugin(), ...react(), ...(options.target === 'wx' ? createWxTargetPlugins(options) : [])]
}
