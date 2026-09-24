import { transformWithOxcWalker } from '../../../utils/oxc-transform.ts'
import type { AstTransformResult } from '../../../utils/transform.ts'

/**
 * In serve, a native Page may load its original physical capsule after HMR has already installed a newer component factory.
 * Taro captures the component at createPageConfig() time; without this lookup, that Page first mounts with stale source even
 * though the patch was acknowledged. Replace only the component argument, leaving the production capsule untouched.
 */
export function injectDevPageComponent({
    capsuleCode,
    componentId,
    capsuleId
}: {
    capsuleCode: string
    componentId: string
    capsuleId: string
}): AstTransformResult {
    // Count matches within this parse: zero would silently keep the stale Page, while multiple make the target ambiguous.
    let matches = 0
    const result = transformWithOxcWalker({
        code: capsuleCode,
        filename: capsuleId,
        sourcemap: false,
        createVisitor(editor) {
            return (node) => {
                if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') {
                    return
                }
                const component = node.arguments[0]
                if (
                    node.callee.name !== 'createPageConfig' ||
                    component?.type !== 'Identifier' ||
                    component.name !== 'PageComponent'
                ) {
                    return
                }
                matches++
                // Match the call in the AST instead of depending on the capsule's whitespace or comments. The Mini dev global
                // plugin supplies this lexical runtime binding; an extra import or global lookup would add an unnecessary edge.
                editor.overwrite(
                    component.start,
                    component.end,
                    `__rolldown_runtime__.resolvePageComponent(${JSON.stringify(componentId)}, PageComponent)`
                )
            }
        }
    })
    if (matches !== 1) {
        throw new Error(`Expected one Page config component argument, found ${matches}`)
    }
    return result
}
