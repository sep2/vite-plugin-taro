import { resolvePackageFile } from './utils/packages.ts'

export const virtualTaroApiId = 'virtual:taro/api'
export const virtualTaroComponentsId = 'virtual:taro/components'

const taroApiModule = resolvePackageFile('dist/runtime/taro/api.js')
const taroComponentsModule = resolvePackageFile('dist/runtime/taro/components.js')

/** Resolves public Taro virtual IDs to their target-neutral runtime modules. */
export function resolveTaroVirtualModule(id: string): string | undefined {
    if (id === virtualTaroApiId) return taroApiModule
    if (id === virtualTaroComponentsId) return taroComponentsModule
}
