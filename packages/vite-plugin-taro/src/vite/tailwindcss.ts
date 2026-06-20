import path from 'node:path'
import process from 'node:process'
import type { PluginOption } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import type { TaroBuildContext } from './types.ts'

function getProjectRoot(): string {
    return process.cwd()
}

function getAppCssEntry(projectRoot: string): string {
    return path.resolve(projectRoot, 'src/app.css')
}

export function createTailwindcssPlugins(context: TaroBuildContext): PluginOption[] {
    const projectRoot = getProjectRoot()
    const appCssEntry = getAppCssEntry(projectRoot)

    const plugins = WeappTailwindcss({
        appType: 'taro',
        generator: {
            target: context.target === 'h5' ? 'web' : 'weapp'
        },
        tailwindcssBasedir: projectRoot,
        cssEntries: [appCssEntry],
        tailwindcss: {
            version: 4,
            packageName: 'tailwindcss'
        },
        cssCalc: false,
        // skyline does not support -webkit prefix.
        autoprefixer: context.target === 'h5',
        postcssOptions: {
            // Tailwind v4 emits legacy :before/:after selectors; skyline requires ::before/::after.
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
