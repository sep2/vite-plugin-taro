import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vpt, { type VptJsonObject, type VptTarget } from 'vite-plugin-taro'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_VPT_')
    const target = getTarget(env)
    const wechatAppId = env.VITE_VPT_WECHAT_APP_ID || 'touristappid'
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
                projectConfigJson: createProjectConfigJson({
                    target: target,
                    wechatAppId: wechatAppId,
                    alipayAppId: alipayAppId
                }),
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

const targetEnvName = 'VITE_VPT_TARGET'
const projectRoot = fileURLToPath(new URL('.', import.meta.url))

function getTarget(env: Record<string, string>): VptTarget {
    const target = env[targetEnvName]
    if (target === 'wx' || target === 'zfb' || target === 'h5') return target
    throw new Error(`${targetEnvName} must be "wx", "zfb", or "h5".`)
}

function createPageJson(target: VptTarget): VptJsonObject {
    if (target === 'zfb') {
        return {
            transparentTitle: 'always',
            titlePenetrate: 'YES'
        }
    }

    return {
        navigationStyle: 'custom',
        navigationBarTextStyle: 'black'
    }
}

function createAppJson(target: VptTarget): VptJsonObject {
    if (target === 'zfb') {
        return {
            window: {
                transparentTitle: 'always',
                titlePenetrate: 'YES'
            }
        }
    }

    return {
        lazyCodeLoading: 'requiredComponents',
        window: {
            navigationStyle: 'custom',
            navigationBarTextStyle: 'black'
        },
        renderer: 'skyline',
        componentFramework: 'glass-easel',
        rendererOptions: {
            skyline: {
                defaultDisplayBlock: true,
                defaultContentBox: true
            }
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
    if (target === 'zfb') {
        return {
            ...(alipayAppId ? { appid: alipayAppId } : {}),
            miniprogramRoot: './',
            component2: true,
            axmlStrictCheck: true,
            enableHMR: true,
            format: 2,
            compileOptions: {
                // Expose the real JavaScript global for SystemJS and shared runtime state; `my` remains the Alipay API namespace.
                globalObjectMode: 'enable',
                // Taro keeps its Alipay output as ES6 and delegates final syntax conversion to the developer tool.
                transpile: {}
            }
        }
    }

    return {
        appid: wechatAppId,
        projectname: 'vite-taro-app',
        description: '',
        compileType: 'miniprogram',
        setting: {
            // WeChat DevTools does not support hot reload with Skyline yet.
            skylineRenderEnable: false,
            urlCheck: false,
            es6: false,
            postcss: false,
            minified: false,
            compileHotReLoad: true,
            enhance: false,
            uglifyFileName: false,
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

function fromRoot(...segments: string[]): string {
    return path.resolve(projectRoot, ...segments)
}
