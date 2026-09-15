import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vpt, { type VptJsonObject, type VptTarget } from 'vite-plugin-taro'
import { polyfillCases } from './src/polyfill-cases.ts'

type MiniTarget = Exclude<VptTarget, 'h5'>

const appTitle = 'Polyfill demo'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_VPT_')
    const target = getTarget(env)
    const wechatAppId = env.VITE_VPT_WECHAT_APP_ID || 'touristappid'
    const alipayAppId = env.VITE_VPT_ALIPAY_APP_ID

    return {
        // WeChat shadows bare URL; resolve it from the global patched by core-js.
        define: { URL: 'globalThis.URL' },
        build: {
            outDir: fromRoot('dist', target)
        },
        plugins: [
            vpt({
                target,
                app: 'src/app.tsx',
                polyfills: polyfillCases.map(({ module }) => module),
                pages: [
                    {
                        path: 'pages/index/index',
                        config: createPageJson(target, appTitle)
                    }
                ],
                appJson: createAppJson(target),
                projectConfigJson: createProjectConfigJson({ target, wechatAppId, alipayAppId }),
                projectPrivateConfigJson: createProjectPrivateConfigJson(target),
                sitemapJson: { rules: [{ action: 'allow', page: '*' }] },
                hmr: {
                    mode: target === 'zfb' ? 'interpreter' : 'devtools'
                }
            })
        ]
    }
})

function createPageJson(target: MiniTarget, title: string): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
                navigationBarTitleText: title
            }
        }
        case 'zfb': {
            return {
                defaultTitle: title
            }
        }
    }
}

function createAppJson(target: MiniTarget): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
                lazyCodeLoading: 'requiredComponents',
                componentFramework: 'glass-easel',
                window: {
                    navigationBarTitleText: appTitle
                }
            }
        }
        case 'zfb': {
            return {
                lazyCodeLoading: 'renderedComponents',
                useDynamicPlugins: true,
                window: {
                    defaultTitle: appTitle
                }
            }
        }
    }
}

function createProjectConfigJson({
    target,
    wechatAppId,
    alipayAppId
}: {
    target: MiniTarget
    wechatAppId: string
    alipayAppId: string | undefined
}): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
                appid: wechatAppId,
                projectname: 'polyfill demo',
                description: 'Runtime checks for opt-in core-js polyfills.',
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
            }
        }
        case 'zfb': {
            return {
                appid: alipayAppId,
                miniprogramRoot: './',
                format: 2,
                compileOptions: {
                    component2: true,
                    globalObjectMode: 'enable',
                    transpile: {
                        script: {
                            ignore: ['**']
                        }
                    }
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
    }
}

function createProjectPrivateConfigJson(target: MiniTarget): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
                setting: {
                    urlCheck: false
                }
            }
        }
        case 'zfb': {
            return {
                ignoreHttpDomainCheck: true,
                ignoreCertificateDomainCheck: true,
                ignoreWebViewDomainCheck: true
            }
        }
    }
}

function getTarget(env: Record<string, string>): MiniTarget {
    const targetEnvName = 'VITE_VPT_TARGET'
    const target = env[targetEnvName]

    if (target === 'wx' || target === 'zfb') {
        return target
    }

    throw new Error(`${targetEnvName} must be "wx" or "zfb".`)
}

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

function fromRoot(...segments: string[]): string {
    return path.resolve(projectRoot, ...segments)
}
