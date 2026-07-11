import type { Plugin } from 'vite'
import { resolvePackageFile } from '../utils/packages.ts'

/** Public IDs used by Taro's API transform and generated target modules. */
export const virtualTaroApiId = 'virtual:taro/api'
export const virtualTaroComponentsId = 'virtual:taro/components'

const runtimeModules = new Map([
    [virtualTaroApiId, resolvePackageFile('dist/runtime/taro/api.js')],
    [virtualTaroComponentsId, resolvePackageFile('dist/runtime/taro/components.js')]
])

/** Resolves target-neutral Taro shims once instead of duplicating this concern in every target plugin. */
export function createTaroRuntimePlugin(): Plugin {
    return {
        name: 'vite-plugin-taro:runtime',
        enforce: 'pre',
        resolveId(id) {
            return runtimeModules.get(id)
        }
    }
}
