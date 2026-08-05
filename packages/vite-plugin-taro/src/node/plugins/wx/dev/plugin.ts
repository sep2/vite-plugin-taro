import type { Plugin } from 'vite'
import { transformWithOxc } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { esTarget } from '../../../utils/constant.ts'
import { rolldownRuntimeId } from '../module.ts'
import { createDevHost } from './dev-host.ts'
import { rewriteReactRefresh } from './react-refresh.ts'

/** Adds the serve-only bundled-development adapter for the wx target. */
export function createWxDevelopmentPlugin(options: VitePluginTaroOptions): Plugin {
    let devHost: { close(): Promise<void> } | null = null

    return {
        name: 'vite-plugin-taro:wx-dev',
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
            handler(code, id) {
                if (id.split('?', 1)[0] === rolldownRuntimeId) {
                    // The dev-mode transform assembles the runtime chunk (Rolldown's base
                    // runtime plus our injected implement) as this module's transform output,
                    // which bypasses the build's es2018 lowering. Real-device engines and
                    // WeChat's upload parser predate class fields and nullish operators, so
                    // the assembled runtime is lowered here — the only module that needs it.
                    // The `setPublicClassFields` assumption emits plain `this.x = ...`
                    // assignments instead of external helpers, whose references the later
                    // minifier would mangle.
                    return transformWithOxc(code, id, {
                        lang: 'js',
                        target: esTarget,
                        sourcemap: false,
                        assumptions: { setPublicClassFields: true }
                    })
                }
                return rewriteReactRefresh(code, id, Boolean(this.environment.config.build.sourcemap))
            }
        },

        configureServer: {
            // Install after Vite and user plugins have finished configuring the environment, but before server.listen()
            // asks bundledDev to create its hard-coded skip-write DevEngine.
            order: 'post',
            async handler(server) {
                devHost = await createDevHost(server, options)
            }
        },

        closeBundle() {
            return devHost?.close()
        }
    }
}
