import path from 'node:path'
import { packageRoot } from './constants.ts'

export const virtualTaroApiId = 'virtual:taro/api'
export const virtualTaroComponentsId = 'virtual:taro/components'

const virtualTaroApiResolvedId = path.join(packageRoot, 'dist/virtual/api.js')
const virtualTaroComponentsResolvedId = path.join(packageRoot, 'dist/virtual/components.js')

export function resolvePublicVirtualModuleId(id: string): string | undefined {
    if (id === virtualTaroApiId) return virtualTaroApiResolvedId
    if (id === virtualTaroComponentsId) return virtualTaroComponentsResolvedId
}
