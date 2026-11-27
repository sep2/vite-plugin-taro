import { normalizePath } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { normalizeModuleId, resolveAppComponentPath } from '../../../utils/modules.ts'
import { appComponentId } from '../../client/constant.ts'
import { orderPages } from '../../page/order-pages.ts'
import { resolvePage } from '../../page/resolve-page.ts'
import { h5AppPath } from '../constant.ts'
import { transformH5App } from '../transform-app.ts'

/** Creates H5 application module resolution and specialization for the current pages. */
export function createH5Resolver(options: Readonly<VptOptions>) {
    const pages = orderPages(options.pages).map(resolvePage)

    return {
        resolveId({ id, projectRoot }: { id: string; projectRoot: string }): string | undefined {
            if (id === appComponentId) {
                return resolveAppComponentPath({ appPath: options.app, projectRoot })
            }
        },

        transform({
            code,
            id,
            projectRoot,
            sourcemap
        }: {
            code: string
            id: string
            projectRoot: string
            sourcemap?: boolean
        }) {
            if (normalizeModuleId(id) === normalizePath(h5AppPath)) {
                return transformH5App({ code, id, options, pages, projectRoot, sourcemap })
            }
        }
    }
}
