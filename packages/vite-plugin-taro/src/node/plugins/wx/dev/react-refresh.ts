import { type PluginObject, types } from '@babel/core'
import { transformWithBabel } from '../../../utils/transform.ts'
import { reactRefreshRuntimeId } from '../module.ts'

/**
 * The @vitejs/plugin-react refresh runtime stores `__registerBeforePerformReactRefresh` on
 * `window`, which does not exist in AppService; the top-level assignment crashes at boot.
 * Rewrites only that exact member expression to `global`; every other window access is untouched.
 */
export function rewriteReactRefresh(code: string, id: string, sourcemap = true) {
    if (id.split('?', 1)[0] !== reactRefreshRuntimeId) {
        return
    }
    return transformWithBabel(code, id, [() => createReactRefreshRewritePlugin()], sourcemap)
}

function createReactRefreshRewritePlugin(): PluginObject {
    return {
        name: 'vite-plugin-taro:wx-react-refresh-rewrite',
        visitor: {
            MemberExpression(memberPath) {
                const member = memberPath.node
                // Only the exact generated `window.__registerBeforePerformReactRefresh = ...` assignment
                // is rewritten; every other window access (user or library code) stays untouched.
                if (
                    !types.isIdentifier(member.object, { name: 'window' }) ||
                    !types.isIdentifier(member.property, { name: '__registerBeforePerformReactRefresh' })
                ) {
                    return
                }
                // AppService has no browser `window` (free `window` is undefined, so the top-level
                // assignment throws at module evaluation). `global` is the AppService global object:
                // the assignment then lands on the App heap like any other global hook.
                member.object = types.identifier('global')
            }
        }
    }
}
