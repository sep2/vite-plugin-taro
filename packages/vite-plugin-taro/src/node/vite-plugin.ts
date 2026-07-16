import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../options.ts'
import { createClientTaroPlugin } from './plugins/client-taro.ts'
import { createWxTargetPlugin } from './target/wx/plugin.ts'

export default function vitePluginTaro(options: VitePluginTaroOptions): PluginOption[] {
    return [createClientTaroPlugin(), ...react(), ...(options.target === 'wx' ? [createWxTargetPlugin(options)] : [])]
}
