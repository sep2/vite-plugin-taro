import type { Plugin, PluginOption } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import type { VitePluginTaroTarget } from '../../../options.ts'
import { packageRequire } from '../../utils/packages.ts'

/** Creates the target-aware Tailwind CSS plugins. */
export function createCssPlugins(target: VitePluginTaroTarget): PluginOption[] {
    const wx = target === 'wx'

    return [
        // createTailwindCssResolver(),
        ...(WeappTailwindcss({
            appType: 'weapp-vite',
            generator: {
                target: wx ? 'weapp' : 'web',
                webCompat: {
                    preset: 'legacy-web'
                }
            },
            cssOptions: {
                cssCalc: false,
                autoprefixer: !wx,
                rem2rpx: true,
                px2rpx: true
            },

            logLevel: 'silent'
        }) ?? [])
    ]
}

/** Resolves CSS-first Tailwind imports from the plugin installation for WX builds. */
function createTailwindCssResolver(): Plugin {
    return {
        name: 'vite-plugin-taro:tailwind-css',
        enforce: 'pre',
        resolveId(id) {
            if (id === 'tailwindcss') {
                return packageRequire.resolve('tailwindcss/index.css')
            }
            if (/^tailwindcss\/[^?#]+\.css$/.test(id)) {
                return packageRequire.resolve(id)
            }
        }
    }
}
