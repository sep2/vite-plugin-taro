import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vpt from 'vite-plugin-taro'

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
                            navigationBarTitleText: 'Towxml Stream'
                        }
                    }
                ],
                appJson: {
                    lazyCodeLoading: 'requiredComponents',
                    componentFramework: 'glass-easel',
                    glassEaselWebview: true,
                    window: {
                        backgroundColor: '#f1f5f9',
                        navigationBarBackgroundColor: '#ffffff',
                        navigationBarTextStyle: 'black',
                        navigationBarTitleText: 'Towxml Stream'
                    }
                },
                projectConfigJson: {
                    appid: wechatAppId,
                    projectname: 'towxml-stream-demo',
                    description: 'React and Tailwind stream typewriter demo backed by the native Towxml component.',
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

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

function fromRoot(...segments: string[]): string {
    return path.resolve(projectRoot, ...segments)
}
