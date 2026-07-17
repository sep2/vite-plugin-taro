import type { Plugin } from 'vite'
import { resolvePackageFile } from '../../utils/packages.ts'

export const clientTaroApiId = 'virtual:taro/api'
const clientTaroComponentId = 'virtual:taro/components'

const clientTaroModules = new Map([
    [clientTaroApiId, resolvePackageFile('dist/runtime/client/taro/api.js')],
    [clientTaroComponentId, resolvePackageFile('dist/runtime/client/taro/component.js')]
])

/** Creates the target-neutral Taro facade plugin. */
export function createClientTaroPlugin(): Plugin {
    return {
        name: 'vite-plugin-taro:client-taro',
        enforce: 'pre',

        resolveId(id) {
            return clientTaroModules.get(id)
        }
    }
}
