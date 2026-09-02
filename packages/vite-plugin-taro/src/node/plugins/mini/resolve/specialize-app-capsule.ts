import * as types from '@babel/types'
import { type AstTransformResult, replaceWithAst } from '../../../utils/transform.ts'
import type { MiniJsonObject } from '../mini-contract.ts'

const appConfigPlaceholder = '__VPT_APP_CONFIG__'

/** Specializes the App capsule with its normalized native configuration. */
export function specializeAppCapsule({
    code,
    id,
    appConfig,
    sourcemap = true
}: {
    code: string
    id: string
    appConfig: MiniJsonObject
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
