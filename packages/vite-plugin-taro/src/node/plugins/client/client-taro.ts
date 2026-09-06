import type { Plugin } from 'vite'
import type { VptTarget } from '../../../options.ts'
import { resolveRuntimeFile } from '../../utils/packages.ts'
import { clientTaroNativeId } from './constant.ts'

/** Public application facade: H5's static ESM namespace or Mini's shared Taro object. */
export const clientTaroApiId = 'virtual:taro/api'

/**
 * Resolves application imports without transforming either the facade or its consumers. Each physical facade imports its
 * canonical backend directly, so upstream @tarojs/taro requests cannot recurse into the generic Mini implementation on H5.
 * H5's optimizer separately resolves dependency-internal Taro requests to the backend, keeping framework initialization out
 * of the components → APIs → components cycle. The public namespace shares those same API functions and state objects.
 */
export function createClientTaroPlugin(target: VptTarget): Plugin {
    const apiPath = resolveRuntimeFile(target === 'h5' ? 'h5/taro-api' : 'client/taro/api')
    const modules: ReadonlyMap<string, string> = new Map([
        [clientTaroApiId, apiPath],
        ['@tarojs/taro', apiPath],
        ['virtual:taro/components', resolveRuntimeFile('client/taro/component')],
        [clientTaroNativeId, resolveRuntimeFile('client/taro/native')]
    ])

    return {
        name: 'vpt:client-taro',
        enforce: 'pre',
        resolveId: (id) => modules.get(id)
    }
}
