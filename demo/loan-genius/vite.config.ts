import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vpt, { type VptJsonObject, type VptTarget } from 'vite-plugin-taro'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_VPT_')
    const target = getTarget(env)
    const wechatAppId = env.VITE_VPT_WECHAT_APP_ID
    const alipayAppId = env.VITE_VPT_ALIPAY_APP_ID
    const ttAppId = env.VITE_VPT_TIKTOK_APP_ID

    return {
        base: target === 'h5' ? './' : undefined,
        resolve: {
            alias: [
                { find: '@components', replacement: fromRoot('src/components') },
                { find: '@utils', replacement: fromRoot('src/utils') }
            ]
        },
        build: {
            outDir: fromRoot('dist', target)
        },
        plugins: [
            vpt({
                target,
                polyfills: ['web.url'],
                app: 'src/app.tsx',
                pages: [
                    {
                        path: 'pages/calculator/index',
                        config: {}
                    },
                    {
                        path: 'pages/calculator/monthly-payments/index',
                        config: {}
                    },
                    {
                        path: 'pages/calculator/history/index',
                        config: {}
                    }
                ],
                appJson: createAppJson(target),
                projectConfigJson: createProjectConfigJson({ target, wechatAppId, alipayAppId, ttAppId }),
                projectPrivateConfigJson: createProjectPrivateConfigJson(target),
                sitemapJson: { rules: [{ action: 'allow', page: '*' }] },
                hmr: {
                    mode: target === 'wx' ? 'devtools' : 'interpreter'
                }
            }),
            {
                name: 'loan-genius:hmr-test-readiness',
                async buildStart() {
                    // Restart regressions widen cleanup into an observable interval. Keeping this opt-in leaves normal builds
                    // unchanged while proving that an already-open DevTools project survives replacement-process startup.
                    const delayMilliseconds = Number(process.env.VPT_HMR_RESTART_BUILD_DELAY_MS ?? 0)
                    if (delayMilliseconds > 0) {
                        await new Promise<void>((resolve) => setTimeout(resolve, delayMilliseconds))
                    }
                },
                configureServer(server) {
                    // Rendered baseline files can precede socket OPEN. The restart test waits for this exact App startup before
                    // editing again, so a stale Page cannot make post-restart HMR appear successful.
                    server.ws.on('vpt:mini-hmr:report', (report: { kind: string; buildId: string }) => {
                        if (report.kind === 'startup') {
                            server.config.logger.info(`[loan-hmr] runtime ready ${report.buildId}`)
                        }
                    })
                }
            }
        ]
    }
})

function getTarget(env: Record<string, string>): VptTarget {
    const targetEnvName = 'VITE_VPT_TARGET'

    const target = env[targetEnvName]

    if (target === 'wx' || target === 'zfb' || target === 'tt' || target === 'h5') {
        return target
    }

    throw new Error(`${targetEnvName} must be "wx", "zfb", "tt", or "h5".`)
}

/** Selects only configuration keys supported by the active Mini Program runtime. */
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
                    navigationStyle: 'custom'
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
        case 'tt': {
            return {
                window: {
                    navigationStyle: 'custom'
                }
            }
        }
        default:
            return {}
    }
}

/** Creates the project file consumed by the selected native development tool. */
function createProjectConfigJson({
    target,
    wechatAppId,
    alipayAppId,
    ttAppId
}: {
    target: VptTarget
    wechatAppId: string
    alipayAppId: string
    ttAppId: string
}): VptJsonObject {
    switch (target) {
        case 'wx': {
            return {
                appid: wechatAppId,
                projectname: '房贷计算器',
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
        case 'tt': {
            return {
                appid: ttAppId,
                projectname: '房贷计算器',
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
        default:
            return {}
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

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
function fromRoot(...segments: string[]): string {
    return path.resolve(projectRoot, ...segments)
}
