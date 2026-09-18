import { getPageConfig } from '../../../utils/project-config.ts'
import { type AstTransformResult, replaceTemplate } from '../../../utils/transform.ts'
import type { MiniPage } from '../mini-contract.ts'

const pagePathPlaceholder = '__VPT_PAGE_PATH__'
const pageConfigPlaceholder = '__VPT_PAGE_CONFIG__'

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
            [pagePathPlaceholder]: JSON.stringify(page.path),
            [pageConfigPlaceholder]: JSON.stringify(getPageConfig(page))
        },
        sourcemap ?? false
    )
}
