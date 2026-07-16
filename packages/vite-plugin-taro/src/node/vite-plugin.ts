import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../options.ts'

export default function vitePluginTaro(options: VitePluginTaroOptions): PluginOption[] {
    return [...react()]
}
