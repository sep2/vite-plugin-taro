import { normalizePath } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { normalizeModuleId, resolveAppComponentPath } from '../../../utils/modules.ts'
import { appComponentId } from '../../client/constant.ts'
import { resolvePages } from '../../page/resolve-pages.ts'
import { h5AppPath } from '../constant.ts'
import { transformH5App } from '../transform-app.ts'

/** Resolves pages and creates H5 application module resolution and specialization. */
export async function createModuleResolver(options: Readonly<VptOptions>, root: string) {
    const pages = await resolvePages({ pages: options.pages, target: options.target, root })

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
