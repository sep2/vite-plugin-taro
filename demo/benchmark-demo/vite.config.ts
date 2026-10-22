import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vpt from 'vite-plugin-taro'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
    if (mode !== 'dom' && mode !== 'template') {
        throw new Error('Build with --mode dom or --mode template.')
    }
    const env = loadEnv(mode, root, 'VITE_VPT_')
    return {
        build: { outDir: path.join(root, 'dist', mode) },
        define: { __BENCHMARK_RENDERER__: JSON.stringify(mode) },
        plugins: [
            vpt({
                target: 'wx',
                renderer: mode,
                app: 'src/app.tsx',
                pages: [{ path: 'pages/index/index', config: { glassEaselWebview: true } }],
                appJson: {
                    renderer: 'webview',
                    componentFramework: 'glass-easel',
                    glassEaselWebview: true,
                    lazyCodeLoading: 'requiredComponents',
                    window: { navigationBarTitleText: 'VPT renderer benchmark' }
                },
                projectConfigJson: {
                    appid: env.VITE_VPT_WECHAT_APP_ID || 'touristappid',
                    projectname: `vpt-benchmark-${mode}`,
                    compileType: 'miniprogram',
                    libVersion: '3.15.2',
                    setting: {
                        es6: false,
                        enhance: false,
                        postcss: false,
                        minified: false,
                        minifyWXSS: false,
                        minifyWXML: false,
                        urlCheck: false,
                        compileHotReLoad: false,
                        skylineRenderEnable: false
                    }
                },
                projectPrivateConfigJson: {
                    setting: { compileHotReLoad: false, skylineRenderEnable: false }
                }
            })
        ]
    }
})
