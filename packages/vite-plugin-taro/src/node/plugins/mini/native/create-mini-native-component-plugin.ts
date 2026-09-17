import type { Plugin } from 'vite'
import { clientTaroNativeId } from '../../client/constant.ts'
import { compileNativeComponentInterface } from './compile-native-component-interface.ts'

/** Expands native interfaces before Vite erases their TypeScript field declarations. */
export function createMiniNativeComponentPlugin(): Plugin {
    return {
        name: 'vpt:mini-native-component',
        transform: {
            order: 'pre',
            filter: { code: clientTaroNativeId },
            handler(code, id) {
                return compileNativeComponentInterface({
                    code,
                    id,
                    sourcemap: Boolean(this.environment.config.build.sourcemap),
                    addWatchFile: (file) => this.addWatchFile(file)
                })
            }
        }
    }
}
