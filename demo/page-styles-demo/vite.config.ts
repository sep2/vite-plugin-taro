import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import type { VptJsonObject, VptTarget } from 'vite-plugin-taro'
import vpt from 'vite-plugin-taro'

type MiniTarget = Exclude<VptTarget, 'h5'>

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const appTitle = 'Page styles demo'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, projectRoot, 'VITE_VPT_')
    const target = getTarget(env.VITE_VPT_TARGET)

    return {
        build: { outDir: path.join(projectRoot, 'dist', target) },
        plugins: [
            vpt({
                target,
                app: 'src/app.tsx',
                pages: ['red', 'blue', 'plain'].map((name) => ({
                    path: `pages/${name}/${name}`,
                    config:
                        target === 'zfb'
                            ? { defaultTitle: `${appTitle}: ${name}` }
                            : { navigationBarTitleText: `${appTitle}: ${name}` }
                })),
                appJson: createAppJson(target),
                projectConfigJson: createProjectConfigJson(target, env),
                projectPrivateConfigJson:
                    target === 'zfb'
                        ? {
                              ignoreHttpDomainCheck: true,
                              ignoreCertificateDomainCheck: true,
                              ignoreWebViewDomainCheck: true
                          }
                        : {
                              setting: {
                                  urlCheck: false,
                                  ...(target === 'wx' ? { compileHotReLoad: true, skylineRenderEnable: false } : {})
                              }
                          },
                sitemapJson: { rules: [{ action: 'allow', page: '*' }] },
                hmr: { mode: target === 'wx' ? 'devtools' : 'interpreter' }
            })
        ]
    }
})

function getTarget(target: string | undefined): MiniTarget {
    if (target === 'wx' || target === 'zfb' || target === 'tt') {
        return target
    }
    throw new Error('VITE_VPT_TARGET must be "wx", "zfb", or "tt".')
}

function createAppJson(target: MiniTarget): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
                lazyCodeLoading: 'requiredComponents',
                componentFramework: 'glass-easel',
                window: { navigationBarTitleText: appTitle }
            }
        }
        case 'zfb': {
            return {
                lazyCodeLoading: 'renderedComponents',
                useDynamicPlugins: true,
                window: { defaultTitle: appTitle }
            }
        }
        case 'tt': {
            return { window: { navigationBarTitleText: appTitle } }
        }
    }
}

function createProjectConfigJson(target: MiniTarget, env: Record<string, string>): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
                appid: env.VITE_VPT_WECHAT_APP_ID || 'touristappid',
                projectname: 'page-styles-demo',
                compileType: 'miniprogram',
                setting: {
                    es6: false,
                    postcss: false,
                    minified: false,
                    enhance: false,
                    minifyWXSS: false,
                    minifyWXML: false
                }
            }
        }
        case 'zfb': {
            return {
                appid: env.VITE_VPT_ALIPAY_APP_ID,
                miniprogramRoot: './',
                format: 2,
                compileOptions: {
                    component2: true,
                    globalObjectMode: 'enable',
                    transpile: { script: { ignore: ['**'] } }
                },
                developOptions: {
                    lazyCompile: false,
                    hotReload: true,
                    skipTranspile: true,
                    sourcemap: false,
                    minify: false
                }
            }
        }
        case 'tt': {
            return {
                appid: env.VITE_VPT_TIKTOK_APP_ID,
                projectname: 'page-styles-demo',
                miniprogramRoot: './',
                compileHotReload: true,
                setting: { es6: false, postcss: false, minified: false, autoCompile: true }
            }
        }
    }
}
