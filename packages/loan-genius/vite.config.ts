import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import taro, { type TaroTarget } from 'vite-plugin-taro/vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const targetEnvName = 'VITE_PLUGIN_TARO_TARGET'
const projectRoot = fileURLToPath(new URL('.', import.meta.url))

function getTarget(env: Record<string, string>): TaroTarget {
    const target = env[targetEnvName]
    if (target === 'wx' || target === 'h5') return target
    throw new Error(`${targetEnvName} must be "wx" or "h5".`)
}

function fromRoot(...segments: string[]): string {
    return path.resolve(projectRoot, ...segments)
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_PLUGIN_TARO_')
    const target = getTarget(env)
    const wechatAppId = env.VITE_PLUGIN_TARO_WECHAT_APP_ID || 'touristappid'

    return {
        base: target === 'h5' ? './' : undefined,
        resolve: {
            alias: [
                { find: '@components', replacement: fromRoot('src/components') },
                { find: '@utils', replacement: fromRoot('src/utils') }
            ]
        },
        build: {
            outDir: fromRoot('dist', target)
        },
        plugins: [
            WeappTailwindcss({
                appType: 'taro',
                generator: {
                    target: target === 'h5' ? 'web' : 'weapp'
                },
                tailwindcssBasedir: projectRoot,
                cssEntries: [fromRoot('src/app.css')],
                tailwindcss: {
                    version: 4,
                    packageName: 'tailwindcss'
                },
                cssCalc: false,
                // skyline does not support -webkit prefix.
                autoprefixer: target === 'h5',
                postcssOptions: {
                    // Tailwind v4 emits legacy :before/:after selectors; skyline requires ::before/::after.
                    plugins: [createWechatPseudoElementPlugin()]
                },
                rem2rpx: true,
                px2rpx: true
            }),
            taro({
                target,
                app: 'src/app.ts',
                pages: [
                    {
                        path: 'pages/calculator/index',
                        config: {}
                    },
                    {
                        path: 'pages/calculator/monthly-payments/index',
                        config: {}
                    },
                    {
                        path: 'pages/calculator/history/index',
                        config: {}
                    }
                ],
                appJson: {
                    lazyCodeLoading: 'requiredComponents',
                    renderer: 'skyline',
                    componentFramework: 'glass-easel',
                    rendererOptions: {
                        skyline: {
                            defaultDisplayBlock: true,
                            defaultContentBox: true
                        }
                    }
                },
                projectConfigJson: {
                    appid: wechatAppId,
                    projectname: '房贷计算器',
                    description: '',
                    compileType: 'miniprogram',
                    // simulatorType: 'wechat',
                    setting: {
                        skylineRenderEnable: true,
                        urlCheck: true,
                        es6: false,
                        postcss: false,
                        minified: false,
                        enhance: false,
                        uglifyFileName: false,
                        // minifyWXSS: true,
                        // minifyWXML: true,
                        // compileHotReLoad: true,
                        preloadBackgroundData: false,
                        newFeature: true,
                        autoAudits: false,
                        coverView: true,
                        showShadowRootInWxmlPanel: false,
                        scopeDataCheck: false,
                        useCompilerModule: false
                    }
                },
                sitemapJson: {
                    rules: [{ action: 'allow', page: '*' }]
                }
            })
        ]
    }
})

function createWechatPseudoElementPlugin() {
    const legacyPseudoElementPattern = /(?<!:):(before|after)\b/g

    return {
        postcssPlugin: 'loan-genius-wechat-pseudo-elements',
        Rule(rule: { selector: string }) {
            rule.selector = rule.selector.replace(legacyPseudoElementPattern, '::$1')
        }
    }
}
