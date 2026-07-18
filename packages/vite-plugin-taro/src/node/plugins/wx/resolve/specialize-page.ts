import { types } from '@babel/core'
import type { VitePluginTaroPageOption } from '../../../../options.ts'
import { type AstTransformResult, replaceWithAst } from '../../../utils/transform.ts'

const pagePathPlaceholder = '__VITE_PLUGIN_TARO_PAGE_PATH__'
const pageConfigPlaceholder = '__VITE_PLUGIN_TARO_PAGE_CONFIG__'

/** Specializes the real Page module for one configured route. */
export function transformPageModule({
    code,
    id,
    page
}: {
    code: string
    id: string
    page: VitePluginTaroPageOption
}): Promise<AstTransformResult> {
    return replaceWithAst(code, id, {
        [pagePathPlaceholder]: types.stringLiteral(page.path),
        [pageConfigPlaceholder]: types.valueToNode(page.config)
    })
}
