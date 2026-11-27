import type { VptOptions } from '../../../options.ts'
import { createPageComponentImportPath } from '../../utils/modules.ts'
import { createAppConfig, getPageConfig } from '../../utils/project-config.ts'
import { type AstTransformResult, replaceTemplate } from '../../utils/transform.ts'

import type { ResolvedPage } from '../page/resolve-page.ts'

/** Specializes only the reserved expressions in VPT's physical H5 App; Vite lowers its TypeScript once afterward. */
export function transformH5App({
    code,
    id,
    options,
    pages,
    projectRoot,
    sourcemap
}: {
    code: string
    id: string
    options: Readonly<VptOptions>
    pages: readonly ResolvedPage[]
    projectRoot: string
    sourcemap?: boolean
}): AstTransformResult {
    return replaceTemplate(
        code,
        id,
        {
            __VPT_H5_APP_CONFIG__: JSON.stringify({ router: {}, ...createAppConfig(options, pages) }),
            __VPT_H5_ROUTES__: `[${pages.map((page) => createRoute(page, projectRoot)).join(',')}]`
        },
        sourcemap ?? true
    )
}

/** Every application-controlled value is JSON-encoded; the route loader itself is fixed compiler-owned syntax. */
function createRoute(page: ResolvedPage, projectRoot: string): string {
    const component = JSON.stringify(createPageComponentImportPath({ pagePath: page.sourcePath, projectRoot }))
    return `{path:${JSON.stringify(page.path)},load:async function(context,params){const page=await import(${component});return [page,context,params]},...${JSON.stringify(getPageConfig(page))}}`
}
