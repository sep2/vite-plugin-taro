import { type PluginObject, types } from '@babel/core'
import { transformWithBabel } from '../../../utils/transform.ts'
import { reactReconcilerRoot, reactRefreshRuntimeId } from '../module.ts'

const runtime = '__rolldown_runtime__'
const reactDevtoolsHook = '__REACT_DEVTOOLS_GLOBAL_HOOK__'

/** Binds Vite React Refresh completion and React Reconciler's DevTools hook to the WX App runtime. */
export function rewriteReactRefresh(code: string, id: string, sourcemap = true) {
    const moduleId = id.split('?', 1)[0]

    if (moduleId === reactRefreshRuntimeId) {
        return transformWithBabel(code, id, [createRefreshRuntimePlugin], sourcemap)
    }

    if (moduleId.startsWith(`${reactReconcilerRoot}/`) && code.includes(reactDevtoolsHook)) {
        return transformWithBabel(code, id, [createReactReconcilerPlugin], sourcemap)
    }

    if (code.includes('window.$Refresh')) {
        return transformWithBabel(code, id, [createRefreshBoundaryPlugin], sourcemap)
    }
}

/** Adapts Vite's Refresh runtime and delays HMR acknowledgement until its debounced refresh has finished. */
function createRefreshRuntimePlugin(): PluginObject {
    return {
        name: 'vite-plugin-taro:wx-react-refresh-runtime',
        visitor: {
            Program(programPath) {
                // The native runtime installed the capture hook before React starts; this Vite preamble step decorates
                // it with Refresh helpers and replays any renderer that registered in the meantime.
                programPath.pushContainer(
                    'body',
                    types.expressionStatement(
                        types.callExpression(types.identifier('injectIntoGlobalHook'), [types.identifier('global')])
                    )
                )
            },

            MemberExpression(memberPath) {
                // Vite's runtime installs and reads these two optional integration hooks during refresh validation.
                // Rewrites the two browser-only hooks used by Vite's own Refresh runtime.
                if (
                    types.isIdentifier(memberPath.node.object, { name: 'window' }) &&
                    types.isIdentifier(memberPath.node.property) &&
                    (memberPath.node.property.name === '__getReactRefreshIgnoredExports' ||
                        memberPath.node.property.name === '__registerBeforePerformReactRefresh')
                ) {
                    memberPath.node.object = types.identifier('global')
                }
            },

            CallExpression(callPath) {
                // This brackets Vite's debounced enqueue/perform pair so the physical publication is acknowledged
                // only after React has reconciled it.
                const callee = callPath.node.callee
                if (
                    !types.isIdentifier(callee) ||
                    (callee.name !== 'enqueueUpdate' && callee.name !== 'performReactRefresh')
                ) {
                    return
                }
                callPath.replaceWith(
                    types.callExpression(
                        types.memberExpression(
                            types.memberExpression(types.identifier('global'), types.identifier(runtime)),
                            types.identifier(callee.name === 'enqueueUpdate' ? 'enqueueRefresh' : 'performReactRefresh')
                        ),
                        [types.identifier(callee.name)]
                    )
                )
                callPath.skip()
            }
        }
    }
}

/** Rebinds only the free DevTools-hook identifier that React Reconciler reads during renderer registration. */
function createReactReconcilerPlugin(): PluginObject {
    return {
        name: 'vite-plugin-taro:wx-react-reconciler',
        visitor: {
            Identifier(identifierPath) {
                if (identifierPath.node.name === reactDevtoolsHook && identifierPath.isReferencedIdentifier()) {
                    identifierPath.replaceWith(
                        types.memberExpression(types.identifier('global'), types.identifier(reactDevtoolsHook))
                    )
                    identifierPath.skip()
                }
            }
        }
    }
}

/** Makes Vite's component preamble and registration helpers use the WX App global without changing user code. */
function createRefreshBoundaryPlugin(): PluginObject {
    return {
        name: 'vite-plugin-taro:wx-react-refresh-boundary',
        visitor: {
            MemberExpression(memberPath) {
                /** Rewrites Vite's component preamble globals but leaves every other browser-style `window.*` expression untouched. */
                if (
                    types.isIdentifier(memberPath.node.object, { name: 'window' }) &&
                    types.isIdentifier(memberPath.node.property) &&
                    memberPath.node.property.name.startsWith('$Refresh')
                ) {
                    memberPath.node.object = types.identifier('global')
                }
            }
        }
    }
}
