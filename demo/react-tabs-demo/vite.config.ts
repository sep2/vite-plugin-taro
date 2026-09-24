import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vpt, { type VptJsonObject, type VptTarget } from 'vite-plugin-taro'
import { tabPages } from './src/tab-pages.ts'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_VPT_')

    const target = getTarget(env)
    const appId = getAppId(env, target)

    return {
        // Native slot filenames are platform-defined; copy only the active target's empty stub.
        publicDir: target === 'wx' || target === 'zfb' ? fromRoot('native-tab-bar-stubs', target) : false,
        build: {
            outDir: fromRoot('dist', target)
        },
        plugins: [
            vpt({
                target,
                app: 'src/app.tsx',
                pages: tabPages.map(({ path }) => ({ path, config: createPageJson(target) })),
                appJson: createAppJson(target),
                projectConfigJson: createProjectConfigJson({ target, appId }),
                projectPrivateConfigJson: createProjectPrivateConfigJson(target),
                sitemapJson: { rules: [{ action: 'allow', page: '*' }] },
                hmr: {
                    mode: target === 'wx' ? 'devtools' : 'interpreter'
                }
            })
        ]
    }
})

function createPageJson(target: VptTarget): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
                navigationStyle: 'custom',
                navigationBarTextStyle: 'black'
            }
        }
        case 'zfb': {
            return {
                transparentTitle: 'always',
                titlePenetrate: 'YES'
            }
        }
        case 'tt': {
            return {
                navigationStyle: 'custom',
                navigationBarTextStyle: 'black'
            }
        }
        default: {
            return {}
        }
    }
}

function createTabBar(target: VptTarget): VptJsonObject {
    if (target === 'zfb') {
        return {
            customize: true,
            textColor: '#667085',
            selectedColor: '#26734d',
            backgroundColor: '#f8fbf4',
            items: tabPages.map(({ path, label }) => ({ pagePath: path, name: label }))
        }
    }

    return {
        custom: true,
        color: '#667085',
        selectedColor: '#26734d',
        backgroundColor: '#f8fbf4',
        list: tabPages.map(({ path, label }) => ({ pagePath: path, text: label }))
    }
}

function createAppJson(target: VptTarget): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
                lazyCodeLoading: 'requiredComponents',
                renderer: 'skyline',
                componentFramework: 'glass-easel',
                glassEaselWebview: true,
                tabBar: createTabBar(target),
                rendererOptions: {
                    skyline: {
                        defaultDisplayBlock: true,
                        defaultContentBox: true
                    }
                },
                window: {
                    navigationStyle: 'custom',
                    navigationBarTextStyle: 'black'
                }
            }
        }
        case 'zfb': {
            return {
                lazyCodeLoading: 'renderedComponents',
                useDynamicPlugins: true,
                tabBar: createTabBar(target),
                window: {
                    transparentTitle: 'always',
                    titlePenetrate: 'YES'
                }
            }
        }
        case 'tt': {
            return {
                tabBar: createTabBar(target),
                window: {
                    navigationStyle: 'custom',
                    navigationBarTextStyle: 'black'
                }
            }
        }
        default: {
            return { tabBar: createTabBar(target) }
        }
    }
}

function createProjectConfigJson({ target, appId }: { target: VptTarget; appId: string | undefined }): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
                appid: appId,
                projectname: 'react-tabs-demo',
                description: '',
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
                appid: appId,
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
        case 'tt': {
            return {
                appid: appId,
                projectname: 'react-tabs-demo',
                miniprogramRoot: './',
                compileHotReload: true,
                setting: {
                    urlCheck: false,
                    es6: false,
                    postcss: false,
                    minified: false,
                    autoCompile: true
                }
            }
        }
        default: {
            return {}
        }
    }
}

function createProjectPrivateConfigJson(target: VptTarget): VptJsonObject {
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
        case 'tt': {
            return {
                setting: {
                    urlCheck: false
                }
            }
        }
        default:
            return {}
    }
}

function getAppId(env: Record<string, string>, target: VptTarget): string {
    switch (target) {
        case 'wx': {
            return env.VITE_VPT_WECHAT_APP_ID ?? ''
        }
        case 'zfb': {
            return env.VITE_VPT_ALIPAY_APP_ID ?? ''
        }
        case 'tt': {
            return env.VITE_VPT_TIKTOK_APP_ID ?? ''
        }
        default: {
            return ''
        }
    }
}

function getTarget(env: Record<string, string>): VptTarget {
    const targetEnvName = 'VITE_VPT_TARGET'

    const target = env[targetEnvName]

    if (target === 'wx' || target === 'zfb' || target === 'tt' || target === 'h5') {
        return target
    }

    throw new Error(`${targetEnvName} must be "wx", "zfb", "tt", or "h5".`)
}

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
function fromRoot(...segments: string[]): string {
    return path.resolve(projectRoot, ...segments)
}
