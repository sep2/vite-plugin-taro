import type { Plugin } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { HmrServer } from './hmr-server.ts'
import { createWxDevelopmentFiles } from './output.ts'
import { rewriteReactRefresh } from './react-refresh.ts'

/** Adds the serve-only bundled-development adapter for the wx target. */
export function createWxDevelopmentPlugin(options: VitePluginTaroOptions): Plugin {
    let hmrServer: HmrServer | null = null

    return {
        name: 'vite-plugin-taro:wx-dev',
        apply: 'serve',

        config() {
            return {
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
            handler: rewriteReactRefresh
        },

        generateBundle() {
            // Emit these as normal assets so Rolldown's initial incremental_write() owns their directories and commit.
            // Future hot updates replace only update.js through the dedicated publisher, outside generateBundle.
            for (const file of createWxDevelopmentFiles()) this.emitFile(file)
        },

        configureServer: {
            // Install after Vite and user plugins have finished configuring the environment, but before server.listen()
            // asks bundledDev to create its hard-coded skip-write DevEngine.
            order: 'post',
            handler(server) {
                hmrServer = new HmrServer(server, options).install()
            }
        },

        closeBundle() {
            // The owned DevEngine is still closed by Vite. This hook only detaches public-file synchronization and waits
            // for already queued public writes, avoiding a recursive engine.close() from its own closeBundle lifecycle.
            return hmrServer?.close()
        }
    }
}
