import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vpt, { type VptTarget } from 'vite-plugin-taro'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_VPT_')
    const target = getTarget(env)
    const wechatAppId = env.VITE_VPT_WECHAT_APP_ID || 'touristappid'

    return {
        build: {
            outDir: fromRoot('dist', target)
        },
        plugins: [
            vpt({
                target,
                app: 'src/app.tsx',
                pages: [
                    {
                        path: 'pages/home/index',
                        config: {
                            navigationStyle: 'custom',
                            navigationBarTextStyle: 'black'
                        }
                    }
                ],
                appJson: {
                    lazyCodeLoading: 'requiredComponents',
                    window: {
                        navigationStyle: 'custom',
                        navigationBarTextStyle: 'black'
                    },
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
                    projectname: 'vite-taro-app',
                    description: '',
                    compileType: 'miniprogram',
                    setting: {
                        // WeChat DevTools does not support hot reload with Skyline yet.
                        skylineRenderEnable: false,
                        urlCheck: false,
                        es6: false,
                        postcss: false,
                        minified: false,
                        compileHotReLoad: true,
                        enhance: false,
                        uglifyFileName: false,
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

const targetEnvName = 'VITE_VPT_TARGET'
const projectRoot = fileURLToPath(new URL('.', import.meta.url))

function getTarget(env: Record<string, string>): VptTarget {
    const target = env[targetEnvName]
    if (target === 'wx' || target === 'h5') return target
    throw new Error(`${targetEnvName} must be "wx" or "h5".`)
}

function fromRoot(...segments: string[]): string {
    return path.resolve(projectRoot, ...segments)
}
