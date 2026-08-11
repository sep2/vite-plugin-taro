import { isReferenceIdentifier, type WalkerEnter } from 'oxc-walker'
import type { RolldownMagicString } from 'rolldown'
import type { Plugin } from 'vite'
import { memoize } from '../../../utils/memoize.ts'
import { transformWithOxcWalker } from '../../../utils/oxc-transform.ts'

/** The React DevTools hook protocol name; free references must target `global` in wx. */
const reactDevtoolsHookProtocol = '__REACT_DEVTOOLS_GLOBAL_HOOK__'

/**
 * Refresh protocol globals that must live on the WeChat `global` object:
 * - `__registerBeforePerformReactRefresh` is assigned at module evaluation so the HMR client can register work that
 *   must finish before a refresh. Leaving it on `window` throws before the refresh runtime can initialize.
 * - `__getReactRefreshIgnoredExports` is an optional extension point read while validating a refresh boundary.
 *   Leaving that read on the nonexistent `window` crashes every update validation pass.
 *
 * Keeping this list explicit prevents the adapter from rewriting unrelated browser accesses if the vendored runtime
 * gains new code. Any future React Refresh protocol addition therefore requires a deliberate compatibility decision.
 */
const refreshRuntimeWindowGlobals = ['__registerBeforePerformReactRefresh', '__getReactRefreshIgnoredExports'] as const

/**
 * Creates the serve-only React Refresh adaptation transforms for the wx target.
 *
 * @vitejs/plugin-react's generated refresh code assumes the web HTML preamble and a browser
 * global scope; wx has neither. Each transform adapts one piece of that contract:
 * - the refresh runtime module (id-filtered): the vendored runtime reads and assigns
 *   `window` protocol globals (rewritten to `global`) and must inject itself at evaluation;
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
                    return removeRefreshPreambleGuard({ code, id })
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
 * `global.__REACT_DEVTOOLS_GLOBAL_HOOK__` exists). The renderer would therefore silently
 * skip injection, leaving React Refresh with no renderer on which to schedule re-renders.
 *
 * The protocol name is unique, but only reference identifiers are rewritten. Declaration
 * keys and explicit members such as `global.__REACT_DEVTOOLS_GLOBAL_HOOK__` must remain
 * untouched; rewriting those would either produce invalid syntax or double-prefix the hook.
 * The eagerly evaluated refresh runtime creates the hook on `global` before the renderer loads.
 */
function createReactDevtoolsHookVisitor(editor: RolldownMagicString): WalkerEnter {
    return function enter(node, parent) {
        if (
            node.type !== 'Identifier' ||
            node.name !== reactDevtoolsHookProtocol ||
            !isReferenceIdentifier(node, parent)
        ) {
            return
        }

        // An explicit member access is required because WeChat does not expose properties of
        // its global object as free lexical bindings. Removing this edit disables renderer
        // registration even though the hook object itself still exists.
        editor.overwrite(node.start, node.end, `global.${reactDevtoolsHookProtocol}`)
    }
}

/**
 * Refresh runtime module: self-inject at evaluation and rewrite its browser protocol globals.
 *
 * In web Vite, an HTML preamble calls `injectIntoGlobalHook(window)` before application
 * modules load. wx has no HTML document or preamble, so nothing performs that bootstrap.
 * The call must live in the refresh runtime module itself:
 * - this module's closure owns `helpersByRendererID`, mounted roots, and the update helpers;
 * - the wx dev-runtime chunk cannot call into it because the refresh module is in a later,
 *   lazily loaded chunk and does not exist when the dev-runtime chunk evaluates.
 *
 * Unlike the preamble's `$RefreshReg$` globals, which boundary modules replace with local
 * wrappers, the renderer-hook machinery has no local equivalent. Without this injected call,
 * the runtime never learns about the renderer or mounted roots and updates cannot refresh UI.
 *
 * Appending the call is safe even when React has already registered its renderer: the refresh
 * runtime replays `hook.renderers` during injection, then its patched commit hooks observe all
 * later mounts and remounts. The same module also contains two browser-only `window` protocol
 * accesses; those must point at `global` or evaluation/update validation throws in WeChat.
 */
function createRefreshRuntimeVisitor(editor: RolldownMagicString): WalkerEnter {
    // The declarations must execute before self-injection, so the call is appended instead of
    // prepended. Removing it would leave the web preamble's only essential responsibility
    // unimplemented in wx.
    editor.append('\ninjectIntoGlobalHook(global);')

    return function enter(node) {
        if (
            node.type === 'MemberExpression' &&
            !node.computed &&
            node.object.type === 'Identifier' &&
            node.object.name === 'window' &&
            node.property.type === 'Identifier' &&
            refreshRuntimeWindowGlobals.some((globalName) => globalName === node.property.name)
        ) {
            // `global` is the shared wx App heap used by the dev runtime and hook injection. Only
            // replacing the object range preserves the vendored runtime byte-for-byte otherwise
            // and prevents unrelated `window` expressions from being silently adapted.
            editor.overwrite(node.object.start, node.object.end, 'global')
        }
    }
}

/**
 * Removes the web-only `if (!window.$RefreshReg$) throw Error(...)` assertion from boundary modules.
 *
 * The assertion verifies that Vite's HTML preamble installed global registration helpers.
 * wx has no preamble and evaluating `window` itself fails. The assertion is unnecessary here:
 * @vitejs/plugin-react generates local `$RefreshReg$` and `$RefreshSig$` wrappers that delegate
 * directly to the imported refresh runtime. Removing the whole statement therefore removes
 * only an invalid platform check; component registration continues through those local wrappers.
 * If this edit is removed, every transformed refresh boundary crashes before its module body runs.
 */
function createRefreshPreambleGuardVisitor(editor: RolldownMagicString): WalkerEnter {
    return function enter(node) {
        if (
            node.type !== 'IfStatement' ||
            node.test.type !== 'UnaryExpression' ||
            node.test.operator !== '!' ||
            node.test.argument.type !== 'MemberExpression' ||
            node.test.argument.computed ||
            node.test.argument.object.type !== 'Identifier' ||
            node.test.argument.object.name !== 'window' ||
            node.test.argument.property.type !== 'Identifier' ||
            node.test.argument.property.name !== '$RefreshReg$'
        ) {
            return
        }

        // Matching the complete AST shape prevents an unrelated `$RefreshReg$` use from being
        // removed. Skipping descendants is required because their ranges disappear with the
        // parent and must not receive overlapping MagicString edits.
        editor.remove(node.start, node.end)
        this.skip()
    }
}

export function transformRefreshRuntime({ code, id }: { code: string; id: string }) {
    return transformWithOxcWalker({
        code,
        filename: id,
        sourcemap: false,
        createVisitor: createRefreshRuntimeVisitor
    })
}

export function transformReactDevtoolsHook({ code, id }: { code: string; id: string }) {
    return transformWithOxcWalker({
        code,
        filename: id,
        sourcemap: false,
        createVisitor: createReactDevtoolsHookVisitor
    })
}

export function removeRefreshPreambleGuard({ code, id }: { code: string; id: string }) {
    return transformWithOxcWalker({
        code,
        filename: id,
        sourcemap: false,
        createVisitor: createRefreshPreambleGuardVisitor
    })
}

/*
 * Each memoized transform owns a mutable cache keyed only by source bytes. The matching runtime/react-family modules are
 * immutable between complete generations, so reparsing them would repeat O(source bytes) Oxc work without observing new state.
 * Source keys still create a fresh result after a dependency upgrade or real module edit, unlike a once-only cache keyed by ID;
 * keeping separate caches prevents identical text in different transform domains from sharing the wrong adaptation.
 */
const fixRefreshRuntime = memoize(transformRefreshRuntime, { getCacheKey: ({ code }) => code })
const fixReactDevtoolsHook = memoize(transformReactDevtoolsHook, { getCacheKey: ({ code }) => code })
