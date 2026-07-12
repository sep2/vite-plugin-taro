import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vitePluginTaro, { type VitePluginTaroTarget } from 'vite-plugin-taro'

const targetEnvName = 'VITE_PLUGIN_TARO_TARGET'
const projectRoot = fileURLToPath(new URL('.', import.meta.url))

function getTarget(env: Record<string, string>): VitePluginTaroTarget {
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
        build: {
            outDir: fromRoot('dist', target)
        },
        plugins: [
            vitePluginTaro({
                target,
                app: 'src/app.ts',
                pages: [
                    {
                        path: 'pages/index/index',
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
                    },
                    window: {
                        navigationStyle: 'custom'
                    }
                },
                projectConfigJson: {
                    appid: wechatAppId,
                    projectname: 'shadcn demo',
                    description: '',
                    compileType: 'miniprogram',
                    setting: {
                        // WeChat DevTools does not support hot reload with Skyline yet.
                        skylineRenderEnable: false,
                        urlCheck: false,
                        es6: false,
                        postcss: false,
                        minified: false,
                        enhance: false,
                        uglifyFileName: false,
                        minifyWXSS: false,
                        minifyWXML: false,
                        compileHotReLoad: true,
                        preloadBackgroundData: false,
                        newFeature: true,
                        autoAudits: false,
                        coverView: true,
                        showShadowRootInWxmlPanel: false,
                        scopeDataCheck: false,
                        useCompilerModule: false
                    }
                },
                projectPrivateConfigJson: {
                    setting: {
                        urlCheck: false
                    }
                },
                sitemapJson: {
                    rules: [{ action: 'allow', page: '*' }]
                }
            })
        ]
    }
})
