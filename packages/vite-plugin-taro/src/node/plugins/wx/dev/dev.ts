import type { Plugin } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { installWxBundledDevelopment } from './bundled-dev.ts'
import { WxDevelopmentMaterializer } from './materializer.ts'
import { rewriteReactRefresh } from './react-refresh.ts'

/** Adds the serve-only bundled-development materializer for the wx target. */
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
                const materializer = new WxDevelopmentMaterializer(server.config, pagePaths)
                const bundledDevelopment = installWxBundledDevelopment({ server, materializer, pagePaths })
                closeDevelopment = () => bundledDevelopment.close()
            }
        },

        closeBundle() {
            return closeDevelopment?.()
        }
    }
}
