import { nodeRequire } from './constants.ts'
import type { TaroBuildContext } from './types.ts'
import { normalizeModuleId } from './utils.ts'

const virtualTaroId = 'virtual:taro'
const virtualTaroComponentsId = 'virtual:taro/components'

export function isPublicVirtualModuleId(id: string): boolean {
    return id === virtualTaroId || id === virtualTaroComponentsId
}

export function loadPublicVirtualModule(id: string, context: TaroBuildContext): string | undefined {
    if (id === virtualTaroId) return createVirtualTaroModule(context)
    if (id === virtualTaroComponentsId) return "export * from '@tarojs/components'\n"
}

function createVirtualTaroModule(context: TaroBuildContext): string {
    if (context.target === 'h5') {
        return "export * from '@tarojs/taro'\nexport { default } from '@tarojs/taro'\n"
    }

    const taroPath = createResolvedImport('@tarojs/taro')

    return `import Taro from ${taroPath}

export default Taro
`
}

function createResolvedImport(id: string): string {
    return JSON.stringify(normalizeModuleId(nodeRequire.resolve(id)))
}
