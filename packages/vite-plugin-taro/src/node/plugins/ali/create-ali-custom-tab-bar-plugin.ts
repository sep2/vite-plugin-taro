import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { isMiniClientEnvironment } from '../mini/dev/plugins.ts'
import type { MiniContract } from '../mini/mini-contract.ts'

const placeholderFiles = {
    'customize-tab-bar/index.axml': '<view class="vpt-tab-bar-placeholder" />\n',
    'customize-tab-bar/index.acss': '.vpt-tab-bar-placeholder { display: none; }\n',
    'customize-tab-bar/index.js': 'Component({})\n',
    'customize-tab-bar/index.json': '{"component":true}\n'
} as const

/** Supplies the shared Alipay/Taobao native custom-tab entry while React owns the visible tab bar. */
export function createAliCustomTabBarPlugin(contract: MiniContract): Plugin {
    return {
        name: 'vpt:ali-custom-tab-bar',
        enforce: 'post',
        applyToEnvironment: isMiniClientEnvironment,
        generateBundle: {
            order: 'post',
            handler(_, bundle) {
                const appJson = contract.options.appJson

                const tabBar = appJson.tabBar
                if (!tabBar || typeof tabBar !== 'object' || !('customize' in tabBar) || tabBar.customize !== true) {
                    return
                }

                const publicDir = this.environment.config.publicDir

                for (const [fileName, source] of Object.entries(placeholderFiles)) {
                    // Native files supplied by the application keep ownership of their output paths.
                    if (bundle[fileName] !== undefined || (publicDir && existsSync(path.join(publicDir, fileName)))) {
                        continue
                    }

                    this.emitFile({ type: 'asset', fileName, source })
                }
            }
        }
    }
}
