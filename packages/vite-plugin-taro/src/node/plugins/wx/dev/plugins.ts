import { normalizePath, type PluginOption, transformWithOxc } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { esTarget } from '../../../utils/constant.ts'
import { memoize } from '../../../utils/memoize.ts'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { appCapsulePath, pageCapsulePath, rolldownRuntimeId, taroRuntimePath } from '../module.ts'
import { createWxDevHost, type WxDevHost } from './dev-host.ts'
import { developmentAppWxssFileName } from './hmr-files.ts'
import { createWxReactRefreshTransforms } from './react-refresh.ts'

const taroRuntimeId = '@tarojs/runtime'

/** Selects the sole Vite environment that owns the physical Mini Program development project. */
export function isWxClientEnvironment(environment: Readonly<{ name: string }>): boolean {
    return environment.name === 'client'
}

/**
 * Adds the serve-only bundled-development plugin set for the wx target: the dev adapter,
 * Page HMR activation, and React Refresh adaptation transforms.
 *
 * The ordered application entries cross this configuration boundary unchanged so the host can compose global CSS without
 * reconstructing the resolver's App/Page ownership policy from unrelated Rolldown shell and transport entries.
 */
export function createWxDevelopmentPlugin(
    options: VitePluginTaroOptions,
    applicationEntryIds: readonly string[]
): PluginOption[] {
    // This mutable handle transfers ownership from configureServer to closeBundle; at most one host exists per plugin instance.
    let host: WxDevHost | null = null
    // Portable hook filters stay broad; these exact identities exclude similarly named user modules.
    const normalizedAppCapsulePath = normalizePath(appCapsulePath)
    const normalizedPageCapsulePath = normalizePath(pageCapsulePath)
    const normalizedTaroRuntimePath = normalizePath(taroRuntimePath)

    return [
        {
            name: 'vpt:wx-dev',
            apply: 'serve',
            // The physical WX DevEngine is a client build. Native environment scoping gives its shared host exactly one
            // generate/close lifecycle instead of admitting hooks from Vite's unrelated SSR environment.
            applyToEnvironment: isWxClientEnvironment,

            config() {
                return {
                    build: {
                        // The development output is the live Mini Program project opened by WeChat DevTools, not a disposable
                        // build artifact. Deleting and recreating its directory tree during a dev-server restart disrupts
                        // DevTools' hot-reload watcher; recreating the same paths does not reliably attach that watcher again.
                        // The host then continues writing hmr/patches.js, but DevTools no longer observes it and therefore never
                        // re-executes the Page shell that consumes and acknowledges the patches. Keep the watched paths present
                        // across host restarts and let the initial complete build overwrite active outputs. This plugin applies
                        // only to `serve`; production builds retain Vite's normal output cleanup.
                        emptyOutDir: false,
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
                    host = await createWxDevHost({
                        server: server,
                        options: options,
                        applicationEntryIds: applicationEntryIds
                    })
                }
            },

            generateBundle: {
                order: 'post',
                handler(_, bundle) {
                    // `vpt:wx` emits the production App wrapper during every complete build: initial startup and each
                    // recovery build, not just once when this plugin instance is created. Development transfers that file
                    // to the host so its only physical write happens after the matching build identity is durable.
                    removeDevelopmentAppWxss(bundle)
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

/**
 * Transfers development ownership of `app.wxss` from complete output to the dev host.
 *
 * The ordinary WX output hook emits the static production wrapper during every complete build. In development, the existing
 * physical wrapper instead contains the previous build ID. If the static asset remained in this bundle, the DevEngine would:
 *
 * 1. replace the versioned wrapper with static production bytes while JavaScript and HMR metadata are still being finalized;
 * 2. let DevTools observe that root-style change and reload the App against the previous build identity;
 * 3. let the host replace the wrapper again with the new build ID, causing a second App reload.
 *
 * Deleting only the in-memory bundle entry avoids both premature writes. Development sets `emptyOutDir: false`, so the prior
 * physical `app.wxss` remains available while the complete output is written. The host replaces it exactly once after
 * `hmr/patches.js` and `hmr/info.js` are durable. Incremental HMR never enters this complete-output hook and continues changing
 * only `assets/global.wxss`, which preserves the App heap. The serve-only plugin leaves production output unchanged.
 */
export function removeDevelopmentAppWxss(bundle: Record<string, unknown>): void {
    delete bundle[developmentAppWxssFileName]
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
