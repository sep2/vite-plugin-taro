import path from 'node:path'
import { normalizePath, type Plugin } from 'vite'
import { createExactModuleIdFilter } from '../../../utils/modules.ts'
import { packageRequire } from '../../../utils/packages.ts'

const reactRefreshRuntimeId = '/@react-refresh'
const reactReconcilerDevelopmentId = normalizePath(
    path.join(
        path.dirname(packageRequire.resolve('react-reconciler/package.json')),
        'cjs/react-reconciler.development.js'
    )
)

/**
 * Installs the missing HTML preamble inside the Refresh runtime. Boundary modules import that runtime before evaluating
 * their preamble guards, including during incremental updates. Reconciler also imports it before registering its renderer.
 * Development defines map only Refresh's reserved window properties to globalThis; ordinary window lookups stay native.
 */
export function createMiniReactRefreshTransforms(): Plugin[] {
    return [
        {
            name: 'vpt:mini-react-refresh-runtime',
            apply: 'serve',
            config() {
                return {
                    // Apply to the runtime and generated component guards without aliasing window or erasing guards.
                    define: {
                        'window.$RefreshReg$': 'globalThis.$RefreshReg$',
                        'window.$RefreshSig$': 'globalThis.$RefreshSig$',
                        'window.__registerBeforePerformReactRefresh': 'globalThis.__registerBeforePerformReactRefresh',
                        'window.__getReactRefreshIgnoredExports': 'globalThis.__getReactRefreshIgnoredExports'
                    }
                }
            },
            transform: {
                order: 'post',
                filter: { id: createExactModuleIdFilter(reactRefreshRuntimeId) },
                handler(code) {
                    return transformRefreshRuntime(code)
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
 * Reproduces the browser preamble at runtime evaluation, after its declarations initialize.
 * The renderer hook, no-op registration and identity signature share Reconciler's real global. Development defines point
 * upstream guards at these same properties without replacing module-local Refresh registration.
 * These shared protocol properties are initialized once per runtime module evaluation, not for each updated boundary.
 */
export function transformRefreshRuntime(code: string): { code: string; map: null } {
    return {
        code: `${code}
injectIntoGlobalHook(globalThis);
globalThis.$RefreshReg$ = () => {};
globalThis.$RefreshSig$ = () => (type) => type;`,
        map: null
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
