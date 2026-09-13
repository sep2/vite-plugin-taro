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
 * The shared Rolldown injection binds free `window` references to the same Taro window in the preamble and boundaries.
 */
export function createMiniReactRefreshTransforms(): Plugin[] {
    return [
        {
            name: 'vpt:mini-react-refresh-runtime',
            apply: 'serve',
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
 * The renderer hook belongs to the real global used by Reconciler. The no-op registration and identity signature belong
 * to the injected Taro window, satisfying upstream guards without replacing module-local Refresh registration.
 * These shared protocol properties are initialized once per runtime module evaluation, not for each updated boundary.
 */
export function transformRefreshRuntime(code: string): { code: string; map: null } {
    return {
        code: `${code}
injectIntoGlobalHook(globalThis);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;`,
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
