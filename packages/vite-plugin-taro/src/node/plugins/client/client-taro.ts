import { normalizePath, type Plugin } from 'vite'
import type { VptTarget } from '../../../options.ts'
import { normalizeModuleId } from '../../utils/modules.ts'
import { resolveRuntimeFile } from '../../utils/packages.ts'
import { clientTaroNativeId } from './constant.ts'
import { injectTaroFrameworkApis } from './inject-taro-framework-apis.ts'

/*
 * Taro API resolution uses one public facade while avoiding a recursive `@tarojs/taro` import:
 *
 * 1. Application imports of `virtual:taro/api` or `@tarojs/taro` resolve to the physical `api.js` facade.
 * 2. The facade imports `vite-plugin-taro-runtime/taro`; its importer identifies the platform backend slot.
 * 3. H5 receives copied platform APIs, while Mini receives the copied generic Taro implementation.
 * 4. React's framework API loader transforms the facade, assigning lifecycle hooks such as `useLaunch` to the same
 *    platform object and exposing them as named exports.
 *
 * The importer-sensitive second step removes the need for another public-looking virtual module while retaining one
 * facade object for platform APIs and framework lifecycles.
 */
/** Public facade used by transformed application API imports. */
export const clientTaroApiId = 'virtual:taro/api'

const clientTaroApiPath = resolveRuntimeFile('client/taro/api')
const normalizedClientTaroApiPath = normalizePath(clientTaroApiPath)

const clientTaroComponentId = 'virtual:taro/components'

const clientTaroModules = new Map([
    [clientTaroApiId, clientTaroApiPath],
    [clientTaroComponentId, resolveRuntimeFile('client/taro/component')],
    [clientTaroNativeId, resolveRuntimeFile('client/taro/native')]
])

/** Creates the shared Taro facade backed by the selected target's API implementation. */
export function createClientTaroPlugin(target: VptTarget): Plugin {
    const platformTaroId = resolvePlatformTaroId(target)

    return {
        name: 'vpt:client-taro',
        enforce: 'pre',

        async resolveId(id, importer) {
            if (id === '@tarojs/taro') {
                return clientTaroApiPath
            }
            if (id === 'vite-plugin-taro-runtime/taro' && isClientTaroFacade(importer)) {
                // Delegate the platform backend to Vite instead of returning an absolute dependency path. H5 marks this
                // backend as an optimization root, so delegation lets Vite substitute its prebundled facade. Removing it
                // bypasses CommonJS interop and exposes backend details such as base64-js directly to the browser.
                return this.resolve(platformTaroId, importer, { skipSelf: true })
            }
            return clientTaroModules.get(id)
        },

        // Taro's framework loader transforms source code, so apply it only to the shared physical facade.
        transform(code, id) {
            if (normalizeModuleId(id) === normalizedClientTaroApiPath) {
                return injectTaroFrameworkApis(code)
            }
        }
    }
}

function resolvePlatformTaroId(target: VptTarget): string {
    return target === 'h5'
        ? 'vite-plugin-taro-runtime/plugin-platform-h5/runtime/apis'
        : 'vite-plugin-taro-runtime/taro'
}

function isClientTaroFacade(importer: string | undefined): boolean {
    return importer !== undefined && normalizeModuleId(importer) === normalizedClientTaroApiPath
}
