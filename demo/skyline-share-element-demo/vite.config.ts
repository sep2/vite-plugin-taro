import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vpt from 'vite-plugin-taro'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, root, 'VITE_VPT_')

    return {
        build: { outDir: path.join(root, 'dist/wx') },
        plugins: [
            vpt({
                target: 'wx',
                app: 'src/app.tsx',
                pages: [{ path: 'pages/gallery/gallery' }, { path: 'pages/detail/detail', prerender: true }],
                appJson: {
                    renderer: 'skyline',
                    componentFramework: 'glass-easel',
                    glassEaselWebview: true,
                    lazyCodeLoading: 'requiredComponents',
                    rendererOptions: {
                        skyline: {
                            defaultDisplayBlock: true,
                            defaultContentBox: true,
                            // Exercise Skyline on phones without requiring a We Analysis rollout.
                            disableABTest: true
                        }
                    },
                    window: {
                        navigationStyle: 'custom',
                        navigationBarTextStyle: 'black'
                    }
                },
                projectConfigJson: {
                    appid: env.VITE_VPT_WECHAT_APP_ID,
                    projectname: 'skyline-share-element-demo',
                    compileType: 'miniprogram',
                    setting: {
                        es6: false,
                        enhance: false,
                        minified: false,
                        minifyWXSS: false,
                        minifyWXML: false
                    }
                },
                projectPrivateConfigJson: {
                    setting: { skylineRenderEnable: true, compileHotReLoad: false, urlCheck: false }
                },
                // Skyline's simulator does not support native hot reload; rebuild without changing rendering semantics.
                hmr: { mode: 'rebuild' }
            })
        ]
    }
})
