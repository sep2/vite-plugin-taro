import { type AstTransformResult, replaceTemplate } from '../../../utils/transform.ts'
import type { MiniJsonObject } from '../mini-contract.ts'

const appConfigPlaceholder = '__VPT_APP_CONFIG__'

/** Specializes the App capsule with its normalized native configuration. */
export function specializeAppCapsule({
    code,
    id,
    appConfig,
    sourcemap
}: {
    code: string
    id: string
    appConfig: MiniJsonObject
    sourcemap?: boolean
}): AstTransformResult {
    return replaceTemplate(
        code,
        id,
        {
            [appConfigPlaceholder]: JSON.stringify(appConfig)
        },
        sourcemap ?? false
    )
}
