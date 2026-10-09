import path from 'node:path'
import { normalizePath, type Plugin } from 'vite'
import { createExactModuleIdFilter, normalizeModuleId, toViteFileImportPath } from '../../../utils/modules.ts'
import { packageRequire, resolveVptRuntime } from '../../../utils/packages.ts'

const viteClientId = normalizePath(
    path.join(path.dirname(packageRequire.resolve('vite/package.json')), 'dist/client/client.mjs')
)
const viteClientFileRequest = normalizeModuleId(toViteFileImportPath(viteClientId))
const miniViteClientId = resolveVptRuntime('mini/dev/vite-client')

/** Supplies native style helpers before Vite externalizes its bundled browser client. */
export function createMiniViteClientPlugin(): Plugin {
    return {
        name: 'vpt:mini-vite-client',
        apply: 'serve',
        enforce: 'pre',
        applyToEnvironment(environment) {
            return environment.name === 'client'
        },
        resolveId: {
            // Vite file URLs can contain a doubled slash before POSIX absolute paths; normalize them in the handler.
            filter: {
                id: [/^\/@fs\//, /(?:^|\/)@vite\/client(?:\?.*)?$/, createExactModuleIdFilter(viteClientId)]
            },
            handler(id) {
                const request = normalizeModuleId(id)
                const publicRequest = path.posix.join(this.environment.config.base, '/@vite/client')
                if (request === publicRequest || request === viteClientId || request === viteClientFileRequest) {
                    return miniViteClientId
                }
            }
        }
    }
}
