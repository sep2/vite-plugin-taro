import type { Plugin } from 'vite'
import { resolvePackageFile } from '../utils/packages.ts'

const clientTaroModules = new Map([
    ['virtual:taro/api', resolvePackageFile('dist/runtime/client/taro/api.js')],
    ['virtual:taro/components', resolvePackageFile('dist/runtime/client/taro/component.js')]
])

export function createClientTaroPlugin(): Plugin {
    return {
        name: 'vite-plugin-taro:client-taro',
        enforce: 'pre',

        resolveId(id) {
            return clientTaroModules.get(id)
        }
    }
}
