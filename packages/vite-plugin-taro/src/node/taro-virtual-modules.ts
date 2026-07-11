import path from 'node:path'
import { packageRoot } from './package-paths.ts'

export const virtualTaroApiId = 'virtual:taro/api'
export const virtualTaroComponentsId = 'virtual:taro/components'

const taroApiModule = path.join(packageRoot, 'dist/runtime/taro/api.js')
const taroComponentsModule = path.join(packageRoot, 'dist/runtime/taro/components.js')

/** Resolves public Taro virtual IDs to their target-neutral runtime modules. */
export function resolveTaroVirtualModule(id: string): string | undefined {
    if (id === virtualTaroApiId) return taroApiModule
    if (id === virtualTaroComponentsId) return taroComponentsModule
}
