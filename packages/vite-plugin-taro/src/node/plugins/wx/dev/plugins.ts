import type { PluginOption } from 'vite'
import { transformWithOxc } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { esTarget } from '../../../utils/constant.ts'
import { memoize } from '../../../utils/memoize.ts'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { appCapsulePath, pageCapsulePath, rolldownRuntimeId, taroRuntimePath } from '../module.ts'
import { createWxDevHost, type WxDevHost } from './dev-host.ts'
import { createWxReactRefreshTransforms } from './react-refresh.ts'

const taroRuntimeId = '@tarojs/runtime'

/**
 * Adds the serve-only bundled-development plugin set for the wx target: the dev adapter,
 * Page HMR activation, and React Refresh adaptation transforms.
 */
export function createWxDevelopmentPlugin(options: VitePluginTaroOptions): PluginOption[] {
    let host: WxDevHost | null = null
    // Portable hook filters stay broad; these exact identities exclude similarly named user modules.
    const normalizedAppCapsulePath = normalizeModuleId(appCapsulePath)
    const normalizedPageCapsulePath = normalizeModuleId(pageCapsulePath)
    const normalizedTaroRuntimePath = normalizeModuleId(taroRuntimePath)

    return [
        {
            name: 'vpt:wx-dev',
            apply: 'serve',

            config() {
                return {
                    build: {
                        // Disable maps in resolved environment config as well as final output so Oxc and Babel skip producing
                        // intermediate maps that Rolldown would discard.
                        sourcemap: false
                    },
                    experimental: {
                        // Ask Vite to resolve its bundled-development graph and expose the private adapter instance. The wx
                        // configureServer hook replaces only its startup method with the directly writing DevEngine.
                        bundledDev: true
                    }
                }
            },

            configureServer: {
                // Install after Vite and user plugins have finished configuring the environment, but before server.listen()
                // asks bundledDev to create its hard-coded skip-write DevEngine.
                order: 'post',
                async handler(server) {
                    host = await createWxDevHost({ server, options })
                }
            },

            closeBundle() {
                return host?.close()
            }
        },
        {
            name: 'vpt:wx-runtime-lowering',
            apply: 'serve',
            transform: {
                order: 'post',
                // The dev-mode transform assembles the runtime chunk (Rolldown's base runtime
                // plus our injected implement) as this module's transform output, which
                // bypasses the build's es2018 lowering. Real-device engines and WeChat's
                // upload parser predate class fields and nullish operators, so the assembled
                // runtime is lowered here — the only module that needs it. The exact id
                // filter needs no code scan; the id must stay in sync with rolldownRuntimeId
                // in module.ts (kept as a regex for the Rolldown-side filter).
                filter: { id: /^\0rolldown\/runtime\.js(?:\?|$)/ },
                handler(code) {
                    // The `setPublicClassFields` assumption emits plain `this.x = ...`
                    // assignments instead of external helpers, whose references the later
                    // minifier would mangle.
                    return fixRolldownRuntime(code)
                }
            }
        },
        {
            name: 'vpt:wx-react-refresh-bootstrap',
            apply: 'serve',
            transform: {
                order: 'post',
                filter: { id: /\/runtime\/wx\/capsule\/app\.js(?:\?|$)/ },
                handler(code, id) {
                    if (normalizeModuleId(id) !== normalizedAppCapsulePath) return
                    return injectReactRefreshBootstrap(code)
                }
            }
        },
        {
            name: 'vpt:wx-page-hmr',
            apply: 'serve',
            transform: {
                order: 'post',
                filter: { id: /\/runtime\/wx\/capsule\/page\.js(?:\?|$)/ },
                handler(code, id) {
                    if (normalizeModuleId(id) !== normalizedPageCapsulePath) return
                    return injectPageHmr(code, getPageRoute(id))
                }
            }
        },
        {
            name: 'vpt:wx-taro-hmr',
            apply: 'serve',
            transform: {
                order: 'post',
                filter: { id: /\/runtime\/wx\/capsule\/taro-runtime\.js(?:\?|$)/ },
                handler(code, id) {
                    if (normalizeModuleId(id) !== normalizedTaroRuntimePath) return
                    return injectTaroConnection(code)
                }
            }
        },
        ...createWxReactRefreshTransforms()
    ]
}

/** Ensures the Refresh hook exists before React's renderer evaluates and injects itself. */
export function injectReactRefreshBootstrap(code: string): { code: string; map: null } {
    return {
        code: `import ${JSON.stringify('/@react-refresh')};\n${code}`,
        map: null
    }
}

/** Connects the shared WX dev runtime to the application graph's Taro runtime instance. */
export function injectTaroConnection(code: string): { code: string; map: null } {
    if (!/\bCurrent\b/.test(code) || !/\bdocument\b/.test(code) || !/\binjectPageInstance\b/.test(code)) {
        throw new Error('WX Taro runtime must expose Current, document, and injectPageInstance for HMR')
    }

    const taroImport = `import { Current as __vptCurrent, document as __vptDocument, injectPageInstance as __vptInjectPageInstance } from ${JSON.stringify(taroRuntimeId)};`

    return {
        code: `${code}\n${taroImport}\n__rolldown_runtime__.connectTaro(__vptCurrent, __vptDocument, __vptInjectPageInstance);`,
        map: null
    }
}

/** Activates development-only lifecycle handling for one plugin-owned Page capsule. */
export function injectPageHmr(code: string, route: string): { code: string; map: null } {
    if (!/\bconst\s+config\s*=/.test(code) || !/\bexport\s+default\s+config\b/.test(code)) {
        throw new Error('WX Page capsule must declare and default-export config before HMR injection')
    }

    return {
        code: `${code}\n__rolldown_runtime__.injectPageHmr(config, ${JSON.stringify(route)});`,
        map: null
    }
}

/** Reads the stable route carried by every specialized Page capsule ID. */
function getPageRoute(id: string): string {
    const queryIndex = id.indexOf('?')
    const route = queryIndex < 0 ? null : new URLSearchParams(id.slice(queryIndex + 1)).get('route')
    if (!route) throw new Error(`WX Page capsule is missing its route: ${id}`)
    return route
}

// The assembled runtime chunk is byte-identical on every build (the base runtime and the
// bundled implement are immutable for the server's lifetime), so the lowering runs once
// and every build reuses it.
const fixRolldownRuntime = memoize((code: string) => {
    return transformWithOxc(code, rolldownRuntimeId, {
        lang: 'js',
        target: esTarget,
        sourcemap: false,
        assumptions: { setPublicClassFields: true }
    })
})
