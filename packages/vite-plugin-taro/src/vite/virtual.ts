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
    if (context.target === 'h5') return createH5VirtualTaroModule()

    const taroPath = createResolvedImport('@tarojs/taro')

    return `import Taro from ${taroPath}

export default Taro
`
}

/**
 * H5 aliases @tarojs/taro to the platform API barrel, bypassing @tarojs/taro/index.js.
 * Run the same hook bootstrap here so React lifecycle APIs like Taro.useLaunch are attached.
 */
function createH5VirtualTaroModule(): string {
    const reactRuntimePath = createResolvedImport('@tarojs/plugin-framework-react/dist/runtime')
    const runtimePath = createResolvedImport('@tarojs/runtime')

    return `import ${reactRuntimePath}
import { hooks } from ${runtimePath}
import Taro from '@tarojs/taro'

if (hooks.isExist('initNativeApi')) {
    hooks.call('initNativeApi', Taro)
}

export * from '@tarojs/taro'
export default Taro
`
}

function createResolvedImport(id: string): string {
    return JSON.stringify(normalizeModuleId(nodeRequire.resolve(id)))
}
