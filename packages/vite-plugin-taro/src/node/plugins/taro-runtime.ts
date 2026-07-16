import type { Plugin } from 'vite'
import { resolvePackageFile } from '../utils/packages.ts'

const runtimeModules = new Map([
    ['virtual:taro/api', resolvePackageFile('dist/runtime/taro/api.js')],
    ['virtual:taro/components', resolvePackageFile('dist/runtime/taro/components.js')]
])

export function createTaroRuntimePlugin(): Plugin {
    return {
        name: 'vite-plugin-taro:runtime',
        enforce: 'pre',

        resolveId(id) {
            return runtimeModules.get(id)
        }
    }
}
