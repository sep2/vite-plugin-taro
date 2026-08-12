import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vpt from 'vite-plugin-taro'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

function fromRoot(...segments: string[]): string {
    return path.resolve(projectRoot, ...segments)
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_VPT_')
    const wechatAppId = env.VITE_VPT_WECHAT_APP_ID || 'touristappid'

    return {
        build: {
            outDir: fromRoot('dist', 'wx')
        },
        plugins: [
            vpt({
                target: 'wx',
                app: 'src/app.tsx',
                pages: [
                    {
                        path: 'pages/index/index',
                        config: {
                            navigationBarTitleText: 'HMR stress lab'
                        }
                    },
                    {
                        path: 'pages/mirror/index',
                        config: {
                            navigationBarTitleText: 'HMR mirror stack'
                        }
                    }
                ],
                appJson: {
                    lazyCodeLoading: 'requiredComponents',
                    window: {
                        backgroundColor: '#e2e8f0',
                        navigationBarBackgroundColor: '#0f172a',
                        navigationBarTextStyle: 'white',
                        navigationBarTitleText: 'HMR stress lab'
                    }
                },
                projectConfigJson: {
                    appid: wechatAppId,
                    projectname: 'hmr-stress-demo',
                    description: 'Deep React tree fixture for WX HMR stress testing.',
                    compileType: 'miniprogram',
                    setting: {
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
