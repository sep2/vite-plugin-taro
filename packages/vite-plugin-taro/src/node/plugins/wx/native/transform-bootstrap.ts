import { types } from '@babel/core'
import type { JsonObject } from '../../../../options.ts'
import { type AstTransformResult, replaceWithAst } from '../../../utils/transform.ts'

const appConfigPlaceholder = '__VITE_PLUGIN_TARO_APP_CONFIG__'

/** Specializes the native bootstrap with the shared App configuration. */
export async function transformBootstrap({
    code,
    id,
    appConfig
}: {
    code: string
    id: string
    appConfig: JsonObject
}): Promise<AstTransformResult> {
    return await replaceWithAst(code, id, {
        [appConfigPlaceholder]: types.valueToNode(appConfig)
    })
}
