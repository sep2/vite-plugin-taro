import * as types from '@babel/types'
import { getPageConfig } from '../../../utils/project-config.ts'
import { type AstTransformResult, replaceWithAst } from '../../../utils/transform.ts'
import type { MiniPage } from '../mini-contract.ts'

const pagePathPlaceholder = '__VPT_PAGE_PATH__'
const pageConfigPlaceholder = '__VPT_PAGE_CONFIG__'

/** Specializes the Page capsule for one configured route. */
export function specializePageCapsule({
    code,
    id,
    page,
    sourcemap = true
}: {
    code: string
    id: string
    page: MiniPage
    sourcemap?: boolean
}): Promise<AstTransformResult> {
    return replaceWithAst(
        code,
        id,
        {
            [pagePathPlaceholder]: types.stringLiteral(page.path),
            [pageConfigPlaceholder]: types.valueToNode(getPageConfig(page))
        },
        sourcemap
    )
}
