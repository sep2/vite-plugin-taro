import type { VitePluginTaroOptions } from '../../../../options.ts'
import { normalizeModuleId, resolveAppComponentPath } from '../../../utils/modules.ts'
import { appComponentId } from '../../client/constant.ts'
import { h5AppPath } from '../constant.ts'
import { transformH5App } from '../transform-app.ts'

/** Creates H5 application module resolution and specialization. */
export function createModuleResolver(options: VitePluginTaroOptions) {
    return {
        resolveId({ id, projectRoot }: { id: string; projectRoot: string }): string | undefined {
            if (id === appComponentId) {
                return resolveAppComponentPath({ appPath: options.app, projectRoot })
            }
        },

        transform({ code, id, projectRoot }: { code: string; id: string; projectRoot: string }) {
            if (normalizeModuleId(id) === normalizeModuleId(h5AppPath)) {
                return transformH5App({
                    code,
                    id,
                    options,
                    projectRoot
                })
            }
        }
    }
}
