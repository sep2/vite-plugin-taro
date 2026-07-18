import { types } from '@babel/core'
import type { JsonObject } from '../../../../options.ts'
import { type AstTransformResult, replaceWithAst } from '../../../utils/transform.ts'

const appConfigPlaceholder = '__VITE_PLUGIN_TARO_APP_CONFIG__'

/** Specializes the amphibious bootstrap with the shared App configuration. */
export function specializeBootstrap({
    code,
    id,
    appConfig,
    sourcemap = true
}: {
    code: string
    id: string
    appConfig: JsonObject
    sourcemap?: boolean
}): Promise<AstTransformResult> {
    return replaceWithAst(
        code,
        id,
        {
            [appConfigPlaceholder]: types.valueToNode(appConfig)
        },
        sourcemap
    )
}
