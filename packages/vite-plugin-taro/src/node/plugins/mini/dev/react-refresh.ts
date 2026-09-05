import path from 'node:path'
import type { WalkerEnter } from 'oxc-walker'
import type { RolldownMagicString } from 'rolldown'
import { normalizePath, type Plugin } from 'vite'
import { memoize } from '../../../utils/memoize.ts'
import { createExactModuleIdFilter } from '../../../utils/modules.ts'
import { transformWithOxcWalker } from '../../../utils/oxc-transform.ts'
import { packageRequire } from '../../../utils/packages.ts'

const reactRefreshRuntimeId = '/@react-refresh'
const reactReconcilerDevelopmentId = normalizePath(
    path.join(
        path.dirname(packageRequire.resolve('react-reconciler/package.json')),
        'cjs/react-reconciler.development.js'
    )
)

/** The React DevTools hook protocol name; free references must target the real Mini Program JavaScript global. */
const reactDevtoolsHookProtocol = '__REACT_DEVTOOLS_GLOBAL_HOOK__'

/**
 * Creates the serve-only Oxc substitution for React's free DevTools-hook references.
 *
 * Bundled Vite folds `define` into its existing native Oxc transform. Oxc rewrites only free references, preserving explicit
 * members, property keys, string contents, and shadowed bindings without an all-module plugin filter or a second AST parse.
 */
export function createMiniReactRefreshDefines(isDevelopment: boolean): Record<string, string> {
    return isDevelopment ? { [reactDevtoolsHookProtocol]: `globalThis.${reactDevtoolsHookProtocol}` } : {}
}

/**
 * Refresh protocol globals that must live on the real Mini Program JavaScript global:
 * - `__registerBeforePerformReactRefresh` is assigned at module evaluation so the HMR client can register work that
 *   must finish before a refresh. Leaving it on `window` throws before the refresh runtime can initialize.
 * - `__getReactRefreshIgnoredExports` is an optional extension point read while validating a refresh boundary.
 *   Leaving that read on the nonexistent `window` crashes every update validation pass.
 *
 * Keeping this list explicit prevents the adapter from rewriting unrelated browser accesses if the refresh runtime
 * gains new code. Any future React Refresh protocol addition therefore requires a deliberate compatibility decision.
 */
const refreshRuntimeWindowGlobals = ['__registerBeforePerformReactRefresh', '__getReactRefreshIgnoredExports'] as const

/**
 * Creates the serve-only React Refresh adaptation transforms for a Mini Program target.
 *
 * @vitejs/plugin-react assumes an HTML preamble and browser global scope; Mini Program hosts provide neither. Each
 * transform owns one distinct compatibility boundary:
 *
 * - The refresh runtime is selected by exact ID. It rewrites only the two browser protocol globals that React Refresh evaluates
 *   and injects its renderer hook at module evaluation, replacing the missing HTML preamble.
 * - React Reconciler is selected by exact physical ID. Its renderer injection receives a static dependency on the refresh
 *   runtime, so hook installation cannot race renderer initialization during cold startup.
 *
 * These adaptations deliberately remain serve-only plugin transforms rather than target-wide production behavior. Reconciler's
 * static refresh dependency establishes hook installation order. The Mini config lowers React's free DevTools-hook protocol with
 * a serve-only native Oxc define, while the final capsule renderer removes React boundaries' browser-preamble assertion during
 * its existing AST traversal. Neither compatibility edge needs a dedicated all-module source filter or second parse.
 */
export function createMiniReactRefreshTransforms(): Plugin[] {
    return [
        {
            name: 'vpt:mini-react-refresh-runtime',
            apply: 'serve',
            transform: {
                order: 'post',
                // The refresh runtime module is id-filtered, so no code scan is needed.
                filter: { id: createExactModuleIdFilter(reactRefreshRuntimeId) },
                handler(code, id) {
                    return fixRefreshRuntime({ code, id })
                }
            }
        },
        {
            name: 'vpt:mini-react-refresh-renderer-dependency',
            apply: 'serve',
            transform: {
                order: 'post',
                filter: { id: createExactModuleIdFilter(reactReconcilerDevelopmentId) },
                handler(code) {
                    return injectReactRefreshRendererDependency(code)
                }
            }
        }
    ]
}

/**
 * Refresh runtime module: self-inject at evaluation and rewrite its browser protocol globals.
 *
 * In web Vite, an HTML preamble calls `injectIntoGlobalHook(window)` before application
 * modules load. Mini Program hosts have no HTML document or preamble, so nothing performs that bootstrap.
 * The call must live in the refresh runtime module itself:
 * - this module's closure owns `helpersByRendererID`, mounted roots, and the update helpers;
 * - the selected Mini Program HMR runtime chunk cannot call into it because the refresh module is in a later, lazily loaded
 *   chunk and does not exist when the HMR runtime chunk evaluates.
 *
 * Unlike the preamble's `$RefreshReg$` globals, which boundary modules replace with local
 * wrappers, the renderer-hook machinery has no local equivalent. Without this injected call,
 * the runtime never learns about the renderer or mounted roots and updates cannot refresh UI.
 *
 * Appending the call is safe even when React has already registered its renderer: the refresh
 * runtime replays `hook.renderers` during injection, then its patched commit hooks observe all
 * later mounts and remounts. The same module also contains two browser-only `window` protocol
 * accesses; those must point at `globalThis` or evaluation/update validation throws in the host.
 */
function createRefreshRuntimeVisitor(editor: RolldownMagicString): WalkerEnter {
    // The declarations must execute before self-injection, so the call is appended instead of
    // prepended. Removing it would leave the web preamble's only essential responsibility
    // unimplemented in a Mini Program.
    editor.append('\ninjectIntoGlobalHook(globalThis);')

    return function enter(node) {
        if (
            node.type === 'MemberExpression' &&
            !node.computed &&
            node.object.type === 'Identifier' &&
            node.object.name === 'window' &&
            node.property.type === 'Identifier' &&
            refreshRuntimeWindowGlobals.some((globalName) => globalName === node.property.name)
        ) {
            // The language global is the shared App heap used by the dev runtime and hook injection. Only replacing the object
            // range preserves the upstream runtime byte-for-byte otherwise and prevents unrelated `window` expressions from
            // being silently adapted.
            editor.overwrite(node.object.start, node.object.end, 'globalThis')
        }
    }
}

/** Makes renderer hook injection statically depend on the refresh runtime. */
export function injectReactRefreshRendererDependency(code: string): { code: string; map: null } {
    if (!/\bhook\.inject\(internals\)/.test(code)) {
        throw new Error('React Reconciler must inject its renderer into the DevTools hook')
    }

    return {
        code: `import '${reactRefreshRuntimeId}'\n${code}`,
        map: null
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

/*
 * The memoized transform owns a mutable one-entry cache keyed only by source bytes. The refresh runtime is immutable between
 * complete generations, so reparsing it would repeat O(source bytes) Oxc work without observing new state. A source key still
 * produces a fresh result after a dependency upgrade or real module edit, unlike an ID-keyed or once-only cache detached from
 * its input.
 */
const fixRefreshRuntime = memoize(transformRefreshRuntime, {
    getCacheKey: ({ code }) => code
})
