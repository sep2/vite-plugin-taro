import type { Plugin } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { installWxBundledDevelopment } from './bundled-dev.ts'
import { rewriteReactRefresh } from './react-refresh.ts'

/** Adds the serve-only bundled-development adapter for the wx target. */
export function createWxDevelopmentPlugin(options: VitePluginTaroOptions): Plugin {
    let closeDevelopment: (() => Promise<void>) | undefined

    return {
        name: 'vite-plugin-taro:wx-dev',
        apply: 'serve',

        config() {
            return {
                experimental: {
                    bundledDev: true
                }
            }
        },

        transform: {
            order: 'post',
            handler: rewriteReactRefresh
        },

        configureServer: {
            order: 'post',
            handler(server) {
                const pagePaths = options.pages.map((page) => page.path)
                const bundledDevelopment = installWxBundledDevelopment({ server, pagePaths })
                closeDevelopment = () => bundledDevelopment.close()
            }
        },

        closeBundle() {
            return closeDevelopment?.()
        }
    }
}
