import { type AstTransformResult, replaceTemplate } from '../../../utils/transform.ts'
import type { MiniPage } from '../mini-contract.ts'

const pageOptionsPlaceholder = '__VPT_PAGE_OPTIONS__'

/** Specializes the Page capsule for one configured route. */
export function specializePageCapsule({
    code,
    id,
    page,
    sourcemap
}: {
    code: string
    id: string
    page: MiniPage
    sourcemap?: boolean
}): AstTransformResult {
    return replaceTemplate(
        code,
        id,
        {
            [pageOptionsPlaceholder]: JSON.stringify({
                path: page.path,
                config: page.config,
                prerender: page.prerender === true
            })
        },
        sourcemap ?? false
    )
}
