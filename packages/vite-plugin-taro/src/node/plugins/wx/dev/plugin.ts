import type { PluginOption } from 'vite'
import { transformWithOxc } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { esTarget } from '../../../utils/constant.ts'
import { rolldownRuntimeId } from '../module.ts'
import { memoize } from '../../../utils/memoize.ts'
import { createWxDevHost, type WxDevHost } from './dev-host.ts'
import { createWxReactRefreshTransforms } from './react-refresh.ts'

/**
 * Adds the serve-only bundled-development plugin set for the wx target: the dev adapter
 * (config, runtime lowering, dev host) plus the React Refresh adaptation transforms.
 */
export function createWxDevelopmentPlugin(options: VitePluginTaroOptions): PluginOption[] {
    let host: WxDevHost | null = null

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
                handler(code, id) {
                    // The `setPublicClassFields` assumption emits plain `this.x = ...`
                    // assignments instead of external helpers, whose references the later
                    // minifier would mangle.
                    return fixRolldownRuntime(code)
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
        ...createWxReactRefreshTransforms()
    ]
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
