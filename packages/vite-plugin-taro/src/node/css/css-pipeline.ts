import type { PluginOption } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

/**
 * Retains the current H5 Tailwind Vite integration without restoring the deleted legacy WX transformer.
 * The web generator keeps route-split CSS imports working for H5, while the greenfield WX style pipeline remains unimplemented.
 */
export function createH5CssPlugins(): PluginOption[] {
    return (
        WeappTailwindcss({
            appType: 'taro',
            // Route split Tailwind imports around Vite's unresolved production CSS package imports.
            rewriteCssImports: true,
            generator: { target: 'web' },
            logLevel: 'silent',
            cssCalc: false,
            autoprefixer: false,
            rem2rpx: true,
            px2rpx: true
        }) ?? []
    )
}
