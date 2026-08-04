import { type PluginObject, types } from '@babel/core'
import { transformWithBabel } from '../../../utils/transform.ts'
import { reactRefreshRuntimeId } from '../module.ts'

const reactRefreshPreambleGuard = 'window.$RefreshReg$'

/**
 * Removes the two browser assumptions of @vitejs/plugin-react's generated refresh code, each in
 * its own target module:
 * - the refresh runtime stores `__registerBeforePerformReactRefresh` on `window`;
 * - boundary modules guard on `window.$RefreshReg$`, which only an HTML preamble would install.
 */
export function rewriteReactRefresh(code: string, id: string, sourcemap = true) {
    if (id.split('?', 1)[0] === reactRefreshRuntimeId) {
        return transformWithBabel(code, id, [rewriteRefreshRuntimeWindowAssignment], sourcemap)
    }
    // Vite's documented refresh protocol global; the generated guard is its only occurrence.
    if (code.includes(reactRefreshPreambleGuard)) {
        return transformWithBabel(code, id, [removeRefreshPreambleGuard], sourcemap)
    }
    return
}

/** Runtime module: the top-level `window.__registerBeforePerformReactRefresh = ...` assignment. */
function rewriteRefreshRuntimeWindowAssignment(): PluginObject {
    return {
        name: 'vite-plugin-taro:wx-refresh-runtime-window-assignment',
        visitor: {
            MemberExpression(memberPath) {
                const member = memberPath.node
                // Only the exact generated assignment is rewritten; every other window access
                // (user or library code) stays untouched.
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

/** Boundary modules: the generated `if (!window.$RefreshReg$) throw Error(...)` preamble guard. */
function removeRefreshPreambleGuard(): PluginObject {
    return {
        name: 'vite-plugin-taro:wx-refresh-preamble-guard',
        visitor: {
            IfStatement(ifPath) {
                // Browser Vite installs `$RefreshReg$` from an HTML preamble, which wx has no
                // equivalent of; the registration microtask only calls the locally imported
                // `registerExportsForReactRefresh`, so the guard is dead code that crashes on
                // `window`. The module is already gated on the guard marker above, so any
                // `!window.$RefreshReg$` test in it is the generated guard.
                const test = ifPath.node.test
                if (
                    types.isUnaryExpression(test, { operator: '!' }) &&
                    types.isMemberExpression(test.argument) &&
                    types.isIdentifier(test.argument.object, { name: 'window' }) &&
                    types.isIdentifier(test.argument.property, { name: '$RefreshReg$' })
                ) {
                    ifPath.remove()
                }
            }
        }
    }
}
