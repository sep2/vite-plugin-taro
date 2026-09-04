import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vpt, { type VptJsonObject, type VptTarget } from 'vite-plugin-taro'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_VPT_')
    const target = getTarget(env)
    const wechatAppId = env.VITE_VPT_WECHAT_APP_ID
    const alipayAppId = env.VITE_VPT_ALIPAY_APP_ID

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
                        config: createPageJson(target)
                    }
                ],
                appJson: createAppJson(target),
                projectConfigJson: createProjectConfigJson({ target, wechatAppId, alipayAppId }),
                projectPrivateConfigJson: createProjectPrivateConfigJson(target),
                sitemapJson: { rules: [{ action: 'allow', page: '*' }] },
                hmr: {
                    mode: target === 'zfb' ? 'interpreter' : 'devtools'
                },
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
        default: {
            return {}
        }
    }
}

function createAppJson(target: VptTarget): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
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
                    navigationStyle: 'custom',
                    navigationBarTextStyle: 'black'
                }
            }
        }
        case 'zfb': {
            return {
                lazyCodeLoading: 'renderedComponents',
                useDynamicPlugins: true,
                window: {
                    transparentTitle: 'always',
                    titlePenetrate: 'YES'
                }
            }
        }
        default: {
            return {}
        }
    }
}

function createProjectConfigJson({
    target,
    wechatAppId,
    alipayAppId
}: {
    target: VptTarget
    wechatAppId: string
    alipayAppId: string | undefined
}): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
                appid: wechatAppId,
                projectname: 'vpt-project',
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
        default:
            return {}
    }
}

function getTarget(env: Record<string, string>): VptTarget {
    const targetEnvName = 'VITE_VPT_TARGET'

    const target = env[targetEnvName]

    if (target === 'wx' || target === 'zfb' || target === 'h5') {
        return target
    }

    throw new Error(`${targetEnvName} must be "wx", "zfb", or "h5".`)
}

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
function fromRoot(...segments: string[]): string {
    return path.resolve(projectRoot, ...segments)
}
