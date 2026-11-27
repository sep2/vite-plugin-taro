import { type AstTransformResult, replaceTemplate } from '../../../utils/transform.ts'
import type { ResolvedPage } from '../../page/resolve-page.ts'

const pageOptionsPlaceholder = '__VPT_PAGE_OPTIONS__'

/** Specializes the Page capsule for one configured route. */
export function specializePageCapsule({
    code,
    id,
    page,
    supportsPagePrerender,
    sourcemap
}: {
    code: string
    id: string
    page: ResolvedPage
    supportsPagePrerender: boolean
    sourcemap?: boolean
}): AstTransformResult {
    return replaceTemplate(
        code,
        id,
        {
            [pageOptionsPlaceholder]: JSON.stringify({
                path: page.route,
                config: page.option.config,
                prerender: supportsPagePrerender && page.option.prerender === true
            })
        },
        sourcemap ?? false
    )
}
