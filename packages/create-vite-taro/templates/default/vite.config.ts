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
        build: {
            outDir: fromRoot('dist', target)
        },
        plugins: [
            vpt({
                target,
                renderer: 'template',
                app: 'src/app.tsx',
                pages: [
                    {
                        path: 'pages/home/index',
                        prerender: true,
                        config: createPageJson(target)
                    },
                    {
                        path: 'pages/explore/explore-page',
                        prerender: true,
                        config: createPageJson(target)
                    },
                    {
                        path: 'pages/about/about-page',
                        prerender: true,
                        config: createPageJson(target)
                    }
                ],
                appJson: createAppJson(target),
                projectConfigJson: createProjectConfigJson(target, appId),
                projectPrivateConfigJson: createProjectPrivateConfigJson(target),
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
                // 在 app json 的 window 上设置，这里就不用设置了
                // glassEaselWebview: true,
                navigationStyle: 'custom',
                navigationBarTextStyle: 'black'
            }
        }
        case 'zfb':
        case 'tb': {
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

function createAppJson(target: VptTarget): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
                renderer: 'skyline', // 不用 skyline 的话，这里修改成 ‘webview’
                lazyCodeLoading: 'requiredComponents',
                componentFramework: 'glass-easel',
                glassEaselWebview: true,
                tabBar: {
                    custom: true,
                    color: '#667085',
                    selectedColor: '#26734d',
                    backgroundColor: '#f8fbf4',
                    list: tabPages.map(({ path, label }) => ({ pagePath: path, text: label }))
                },
                rendererOptions: {
                    skyline: {
                        defaultDisplayBlock: true,
                        defaultContentBox: true,
                        disableABTest: true
                    }
                },
                window: {
                    glassEaselWebview: true,
                    navigationStyle: 'custom',
                    navigationBarTextStyle: 'black'
                }
            }
        }
        case 'zfb':
        case 'tb': {
            return {
                lazyCodeLoading: 'renderedComponents',
                subPackageBuildType: 'shared',
                useDynamicPlugins: true,
                tabBar: {
                    customize: true,
                    textColor: '#667085',
                    selectedColor: '#26734d',
                    backgroundColor: '#f8fbf4',
                    items: tabPages.map(({ path, label }) => ({ pagePath: path, name: label }))
                },
                window: {
                    transparentTitle: 'always',
                    titlePenetrate: 'YES'
                }
            }
        }
        case 'tt': {
            return {
                tabBar: {
                    custom: true,
                    color: '#667085',
                    selectedColor: '#26734d',
                    backgroundColor: '#f8fbf4',
                    list: tabPages.map(({ path, label }) => ({ pagePath: path, text: label }))
                },
                window: {
                    navigationStyle: 'custom',
                    navigationBarTextStyle: 'black'
                }
            }
        }
        default: {
            return {}
        }
    }
}

function createProjectConfigJson(target: VptTarget, appId: string | undefined): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
                appid: appId,
                projectname: 'vpt-project',
                description: '',
                compileType: 'miniprogram',
                setting: {
                    // 在这里改为 true 开启 Skyline，默认关闭
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
        case 'zfb':
        case 'tb': {
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
                projectname: 'vpt-project',
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
        case 'zfb':
        case 'tb': {
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
        case 'tb': {
            return env.VITE_VPT_TAOBAO_APP_ID ?? ''
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

    if (target === 'wx' || target === 'zfb' || target === 'tb' || target === 'tt' || target === 'h5') {
        return target
    }

    throw new Error(`${targetEnvName} must be "wx", "zfb", "tb", "tt", or "h5".`)
}

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
function fromRoot(...segments: string[]): string {
    return path.resolve(projectRoot, ...segments)
}
