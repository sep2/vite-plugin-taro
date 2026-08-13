import * as types from '@babel/types'
import type { VptJsonObject } from '../../../../options.ts'
import { type AstTransformResult, replaceWithAst } from '../../../utils/transform.ts'

const appConfigPlaceholder = '__VPT_APP_CONFIG__'

/** Specializes the amphibious bootstrap with the shared App configuration. */
export function specializeBootstrap({
    code,
    id,
    appConfig,
    sourcemap = true
}: {
    code: string
    id: string
    appConfig: VptJsonObject
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
