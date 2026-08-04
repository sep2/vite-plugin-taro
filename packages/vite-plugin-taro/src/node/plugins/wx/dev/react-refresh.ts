import { type PluginObject, types } from '@babel/core'
import { transformWithBabel } from '../../../utils/transform.ts'
import { reactRefreshRuntimeId } from '../module.ts'

const reactRefreshPreambleGuard = 'window.$RefreshReg$'

/**
 * Removes the browser assumptions of @vitejs/plugin-react's generated refresh code:
 * - the refresh runtime reads and assigns `window` protocol globals;
 * - the refresh runtime needs an explicit hook injection (the web HTML preamble does it);
 * - boundary modules guard on `window.$RefreshReg$`, which only an HTML preamble would install.
 */
export function rewriteReactRefresh(code: string, id: string, sourcemap = true) {
    if (id.split('?', 1)[0] === reactRefreshRuntimeId) {
        return transformWithBabel(code, id, [rewriteRefreshRuntimeWindowAccess, injectRefreshGlobalHook], sourcemap)
    }
    // Vite's documented refresh protocol global; the generated guard is its only occurrence.
    if (code.includes(reactRefreshPreambleGuard)) {
        return transformWithBabel(code, id, [removeRefreshPreambleGuard], sourcemap)
    }
    return
}

/** Runtime module: self-inject at evaluation — the wx App heap has no HTML preamble. */
function injectRefreshGlobalHook(): PluginObject {
    return {
        name: 'vite-plugin-taro:wx-refresh-global-hook-injection',
        visitor: {
            Program(programPath) {
                // The renderer already injected into the hook (created by the dev runtime
                // chunk) when the App mounted; injectIntoGlobalHook replays its renderers.
                programPath.pushContainer(
                    'body',
                    types.expressionStatement(
                        types.callExpression(types.identifier('injectIntoGlobalHook'), [types.identifier('global')])
                    )
                )
            }
        }
    }
}

/** Runtime module: rewrites only the exact known `window.<global>` protocol accesses. */
function rewriteRefreshRuntimeWindowAccess(): PluginObject {
    /** Refresh protocol globals on `window` that AppService must see on `global`; add names one by one. */
    const refreshRuntimeWindowGlobals = ['__registerBeforePerformReactRefresh', '__getReactRefreshIgnoredExports']

    return {
        name: 'vite-plugin-taro:wx-refresh-runtime-window-access',
        visitor: {
            MemberExpression(memberPath) {
                const member = memberPath.node
                if (
                    !types.isIdentifier(member.object, { name: 'window' }) ||
                    !types.isIdentifier(member.property) ||
                    !refreshRuntimeWindowGlobals.includes(member.property.name)
                ) {
                    return
                }
                // AppService has no browser `window` (free `window` is undefined, so the
                // top-level assignment throws at module evaluation). `global` is the
                // AppService global object: the protocol globals then land on the App heap
                // like any other global hook. This transform runs only on the refresh
                // runtime module, whose window accesses are all generated protocol code.
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
