import { type PluginObject, types } from '@babel/core'
import type { Plugin } from 'vite'
import { memoize } from '../../../utils/memoize.ts'
import { transformWithBabel } from '../../../utils/transform.ts'

/** The React DevTools hook protocol name; free references must target `global` in wx. */
const reactDevtoolsHookProtocol = '__REACT_DEVTOOLS_GLOBAL_HOOK__'

/**
 * Creates the serve-only React Refresh adaptation transforms for the wx target.
 *
 * @vitejs/plugin-react's generated refresh code assumes the web HTML preamble and a browser
 * global scope; wx has neither. Each transform adapts one piece of that contract:
 * - the refresh runtime module (id-filtered): the vendored runtime reads and assigns
 *   `window` protocol globals (rewritten to `global`) and must inject itself at evaluation
 *   — the preamble's `injectIntoGlobalHook` call has no HTML home in wx;
 * - react-family modules (filtered on free references): the DevTools hook is read as a free
 *   variable, which the WeChat runtime scope never resolves against `global` — every free
 *   reference becomes an explicit member access;
 * - boundary modules (filtered on the guard): the preamble's `$RefreshReg$` global is not
 *   needed because the transform generates local wrappers over the imported refresh
 *   runtime, so the guard that checks for the global is removed.
 *
 * Each transform's filter is its routing: the three domains are disjoint, so a module is
 * transformed by at most one of them, and modules outside all three never reach a handler.
 */
export function createWxReactRefreshTransforms(): Plugin[] {
    return [
        {
            name: 'vpt:wx-react-refresh-runtime',
            apply: 'serve',
            transform: {
                order: 'post',
                // The vendored refresh runtime module; id-filtered, so no code scan.
                filter: { id: /^\/@react-refresh(?:\?|$)/ },
                handler(code, id) {
                    return fixRefreshRuntime({ code, id })
                }
            }
        },
        {
            name: 'vpt:wx-react-devtools-hook',
            apply: 'serve',
            transform: {
                order: 'post',
                // Matches only free references (react-family modules). The member accesses in
                // the refresh runtime and the dev runtime chunk never match, so they need no
                // id exclusion.
                filter: { code: /(^|[^.\w$])__REACT_DEVTOOLS_GLOBAL_HOOK__/ },
                handler(code, id) {
                    return fixReactDevtoolsHook({ code, id })
                }
            }
        },
        {
            name: 'vpt:wx-refresh-preamble-guard',
            apply: 'serve',
            transform: {
                order: 'post',
                // Vite's documented refresh protocol global; the generated guard is its only
                // occurrence, in boundary modules.
                filter: { code: /window\.\$RefreshReg\$/ },
                handler(code, id) {
                    return transformWithBabel(code, id, [removeRefreshPreambleGuard], false)
                }
            }
        }
    ]
}

/**
 * React-family modules: free `__REACT_DEVTOOLS_GLOBAL_HOOK__` reads must target `global`.
 *
 * The renderer checks the hook with `typeof __REACT_DEVTOOLS_GLOBAL_HOOK__` and injects via
 * `hook.inject(...)` — but in the WeChat runtime, free-variable reads never resolve against
 * `global`'s properties (verified: the free lookup is undefined while
 * `global.__REACT_DEVTOOLS_GLOBAL_HOOK__` exists), so the renderer would silently skip
 * injection and React Refresh would have no renderer to schedule re-renders on.
 *
 * The name is unique to the React DevTools protocol, so rewriting every free reference to an
 * explicit member access is precise. The hook itself is created on `global` by the dev
 * runtime chunk (see dev-runtime.ts).
 */
function rewriteReactDevtoolsHookGlobal(): PluginObject {
    return {
        name: 'vpt:wx-react-devtools-hook-global',
        visitor: {
            Identifier(identifierPath) {
                const node = identifierPath.node
                if (!types.isIdentifier(node, { name: reactDevtoolsHookProtocol })) {
                    return
                }
                const parent = identifierPath.parentPath
                // A member expression property (e.g. `global.__REACT_DEVTOOLS_GLOBAL_HOOK__`)
                // is already explicit and must not be rewritten again.
                if (parent.isMemberExpression() && parent.node.property === node) {
                    return
                }
                identifierPath.replaceWith(
                    types.memberExpression(types.identifier('global'), types.identifier(node.name))
                )
            }
        }
    }
}

/**
 * Refresh runtime module: self-inject at evaluation — the wx App heap has no HTML preamble.
 *
 * In web Vite, the HTML preamble calls `injectIntoGlobalHook(window)` before any module
 * loads; nothing does that in wx. The call must live in this module itself:
 * - its closure owns the refresh state (helpersByRendererID, mountedRoots), so the same
 *   instance that the generated boundary code imports must bootstrap itself;
 * - the dev runtime chunk cannot reach it: the module is in a lazily-loaded chunk that
 *   requires the runtime chunk first, so it does not exist when the runtime evaluates.
 *
 * Unlike the preamble's `$RefreshReg$` globals (removed by removeRefreshPreambleGuard
 * because boundary modules define local wrappers), the hook machinery has no local
 * equivalent — without it the refresh runtime never learns the renderer or the mounted
 * roots, so the injection is the one preamble responsibility that must be replicated.
 *
 * Timing is safe because injectIntoGlobalHook replays hook.renderers: the renderer already
 * injected into the hook (created by the dev runtime chunk) when the App mounted, and the
 * replay captures it; the patched commit hooks then track every later mount, including the
 * remounts on re-execution.
 */
function injectRefreshGlobalHook(): PluginObject {
    return {
        name: 'vpt:wx-refresh-global-hook-injection',
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

/**
 * Refresh runtime module: rewrites the generated `window.<protocol>` accesses to `global`.
 *
 * The vendored refresh runtime is written for browsers and uses `window` for its protocol
 * globals, but the WeChat runtime has no `window` — the free identifier is undefined — so the
 * top-level assignment would throw at module evaluation, and the ignored-exports read
 * inside the refresh validator would crash every update pass.
 *
 * Only the exact known protocol names are rewritten, one by one, so unrelated `window`
 * accesses are never touched and future protocol additions are deliberate.
 */
function rewriteRefreshRuntimeWindowAccess(): PluginObject {
    /**
     * Refresh protocol globals that must land on the WeChat `global`:
     * - `__registerBeforePerformReactRefresh`: assigned at module scope; in web, the HMR
     *   client registers pre-refresh callbacks through it — the assignment throws on
     *   undefined `window`;
     * - `__getReactRefreshIgnoredExports`: read in validateRefreshBoundaryAndEnqueueUpdate
     *   as an optional extension point — a read on undefined `window` crashes.
     */
    const refreshRuntimeWindowGlobals = ['__registerBeforePerformReactRefresh', '__getReactRefreshIgnoredExports']

    return {
        name: 'vpt:wx-refresh-runtime-window-access',
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
                // `global` is the WeChat global object — the same one the hook injection
                // and the rest of the wx glue speak — so the protocol globals land on the
                // App heap like any other global hook.
                member.object = types.identifier('global')
            }
        }
    }
}

/** Boundary modules: remove the generated `if (!window.$RefreshReg$) throw Error(...)` guard. */
function removeRefreshPreambleGuard(): PluginObject {
    return {
        name: 'vpt:wx-refresh-preamble-guard',
        visitor: {
            IfStatement(ifPath) {
                // The guard is a web-only sanity check that the HTML preamble installed the
                // `$RefreshReg$` global. wx has no preamble and no such global — but the
                // boundary module does not need it: the plugin transform generates local
                // `$RefreshReg$`/`$RefreshSig$` wrappers that delegate to the imported
                // refresh runtime, so registration works without the global. The guard
                // itself only crashes on the undefined `window`, so it is removed.
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

// The refresh runtime module and the react-family modules are immutable for the server's
// lifetime (they only change when the plugin is rebuilt), so their Babel transforms run once
// per module and every build reuses the output.
const fixRefreshRuntime = memoize(
    ({ code, id }: { code: string; id: string }) =>
        transformWithBabel(code, id, [rewriteRefreshRuntimeWindowAccess, injectRefreshGlobalHook], false),
    { getCacheKey: ({ code }) => code }
)

const fixReactDevtoolsHook = memoize(
    ({ code, id }: { code: string; id: string }) =>
        transformWithBabel(code, id, [rewriteReactDevtoolsHookGlobal], false),
    { getCacheKey: ({ code }) => code }
)
