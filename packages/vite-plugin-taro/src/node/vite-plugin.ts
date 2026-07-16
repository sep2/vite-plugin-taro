import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../options.ts'
import { createWxTargetPlugin } from './target/wx/plugin.ts'

export default function vitePluginTaro(options: VitePluginTaroOptions): PluginOption[] {
    return [...react(), ...(options.target === 'wx' ? [createWxTargetPlugin()] : [])]
}
