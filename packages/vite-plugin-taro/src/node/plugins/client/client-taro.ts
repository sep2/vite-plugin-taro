import type { Plugin } from 'vite'
import { resolvePackageFile } from '../../utils/packages.ts'
import { clientTaroNativeId } from './constant.ts'

export const clientTaroApiId = 'virtual:taro/api'
const clientTaroComponentId = 'virtual:taro/components'
const clientTaroModules = new Map([
    [clientTaroApiId, resolvePackageFile('dist/runtime/client/taro/api.js')],
    [clientTaroComponentId, resolvePackageFile('dist/runtime/client/taro/component.js')],
    [clientTaroNativeId, resolvePackageFile('dist/runtime/client/taro/define-native-component.js')]
])

/** Creates the target-neutral Taro facade plugin. */
export function createClientTaroPlugin(): Plugin {
    return {
        name: 'vpt:client-taro',
        enforce: 'pre',

        resolveId(id) {
            return clientTaroModules.get(id)
        }
    }
}
