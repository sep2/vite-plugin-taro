import type { PluginOption } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import type { VitePluginTaroBuildContext } from './types.ts'

export function createTailwindcssPlugins(context: VitePluginTaroBuildContext): PluginOption[] {
    const plugins = WeappTailwindcss({
        appType: 'taro',
        generator: {
            target: context.target === 'wx' ? 'weapp' : 'web',
            webCompat: context.target === 'h5' ? { features: { layer: false } } : undefined
        },
        cssCalc: false,
        // skyline does not support -webkit prefix.
        autoprefixer: false,
        rem2rpx: true,
        px2rpx: true
    })

    return plugins ?? []
}
