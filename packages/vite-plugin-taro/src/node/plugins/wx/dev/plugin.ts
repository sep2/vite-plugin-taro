import type { Plugin } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
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
            // React's Vite plugin has already injected its browser-oriented Refresh wrapper at this point. Rewrite only
            // those generated runtime references; user-authored window access remains untouched.
            handler(code, id) {
                return rewriteReactRefresh(code, id, false)
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
            // The owned DevEngine is still closed by Vite. This hook only detaches public-file synchronization and waits
            // for already queued public writes, avoiding a recursive engine.close() from its own closeBundle lifecycle.
            return devHost?.close()
        }
    }
}
