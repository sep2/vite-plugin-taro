import { normalizePath } from 'vite'
import type { VptOptions, VptPageOption } from '../../../../options.ts'
import { normalizeModuleId, resolveAppComponentPath } from '../../../utils/modules.ts'
import { appComponentId } from '../../client/constant.ts'
import { h5AppPath } from '../constant.ts'
import { transformH5App } from '../transform-app.ts'

/** Creates H5 application module resolution and specialization for the current pages. */
export function createH5Resolver(options: Readonly<VptOptions>) {
    // setPages replaces the ordered snapshot consumed by subsequent App transforms.
    let pages: readonly VptPageOption[] = []

    return {
        setPages(resolvedPages: readonly VptPageOption[]) {
            pages = resolvedPages
        },

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
