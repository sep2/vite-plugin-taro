import tailwindcss from '@tailwindcss/vite'
import type { PluginOption } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import type { VitePluginTaroBuildContext } from './types.ts'

export function createTailwindcssPlugins(context: VitePluginTaroBuildContext): PluginOption[] {
    if (context.target === 'h5') return [tailwindcss()]

    const plugins = WeappTailwindcss({
        appType: 'taro',
        generator: {
            target: 'weapp'
        },
        tailwindcss: {
            version: 4,
            packageName: 'tailwindcss'
        },
        cssCalc: false,
        // skyline does not support -webkit prefix.
        autoprefixer: false,
        postcssOptions: {
            // Tailwind v4 prod mode emits legacy :before/:after selectors; skyline requires ::before/::after.
            plugins: [createWechatPseudoElementPlugin()]
        },
        rem2rpx: true,
        px2rpx: true
    })

    return plugins ?? []
}

function createWechatPseudoElementPlugin() {
    const legacyPseudoElementPattern = /(?<!:):(before|after)\b/g

    return {
        postcssPlugin: 'vite-plugin-taro-wechat-pseudo-elements',
        Rule(rule: { selector: string }) {
            rule.selector = rule.selector.replace(legacyPseudoElementPattern, '::$1')
        }
    }
}
