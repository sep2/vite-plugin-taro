import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { normalizePath, resolveConfig, transformWithOxc } from 'vite'
import vpt from '../../../../index.ts'
import { packageRequire } from '../../../utils/packages.ts'
import {
    createMiniReactRefreshDefines,
    createMiniReactRefreshTransforms,
    injectReactRefreshRendererDependency,
    transformRefreshRuntime
} from './react-refresh.ts'

const preambleGuard = `if (!window.$RefreshReg$) { throw new Error("@vitejs/plugin-react can't detect preamble. Something is wrong.") }`

for (const target of ['wx', 'zfb'] as const) {
    test(`${target}: runtime preamble satisfies cold and repeated boundary evaluation without removing guards`, async () => {
        const config = await resolveConfig(
            {
                configFile: false,
                plugins: vpt({
                    target,
                    app: 'src/app.tsx',
                    pages: [{ path: 'pages/home/index' }],
                    appJson: {},
                    projectConfigJson: {}
                })
            },
            'serve'
        )
        const runtimePath = path.join(
            path.dirname(packageRequire.resolve('@vitejs/plugin-react')),
            'refresh-runtime.js'
        )
        const runtime = transformRefreshRuntime(await readFile(runtimePath, 'utf8'))
        const entry = path.join(path.dirname(runtimePath), 'preamble-test.js')
        const result = await build({
            input: entry,
            plugins: [
                {
                    name: 'test:refresh-preamble',
                    load(id) {
                        if (id === runtimePath) {
                            return runtime
                        }
                        if (id === entry) {
                            return `
import { validateRefreshBoundaryAndEnqueueUpdate } from './refresh-runtime.js'
export { window as runtimeWindow } from 'vite-plugin-taro-runtime/runtime/mini'
export { validateRefreshBoundaryAndEnqueueUpdate }
${preambleGuard}
export function evaluateBoundary() {
    ${preambleGuard}
    const Component = () => null
    window.$RefreshReg$(Component, 'Component')
    return window.$RefreshSig$()(Component) === Component
}
`
                        }
                    },
                    resolveId(id) {
                        if (id === entry) {
                            return entry
                        }
                    }
                }
            ],
            transform: {
                ...config.build.rolldownOptions.transform,
                define: { ...config.define, 'process.env.NODE_ENV': JSON.stringify('development') }
            },
            output: { format: 'cjs', exports: 'named' },
            write: false
        })
        const chunk = result.output[0]
        assert.ok(chunk?.type === 'chunk')
        assert.match(chunk.code, /can't detect preamble/)
        // Isolate the shared protocol state from Node and from the other target's runtime.
        const context = { exports: {}, global: {}, setTimeout, clearTimeout, console }
        runInNewContext(chunk.code, context)
        assert.equal(runInNewContext('typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.inject', context), 'function')
        assert.equal(runInNewContext('typeof globalThis.$RefreshReg$', context), 'undefined')
        assert.equal(runInNewContext('typeof globalThis.__registerBeforePerformReactRefresh', context), 'undefined')
        assert.equal(runInNewContext('exports.evaluateBoundary()', context), true)
        assert.equal(runInNewContext('exports.evaluateBoundary()', context), true)
        assert.equal(
            runInNewContext("exports.validateRefreshBoundaryAndEnqueueUpdate('fixture', { removed: 1 }, {})", context),
            'Could not Fast Refresh (export removed)'
        )
        // Prove that the guard is still active rather than erased by a transform.
        runInNewContext('delete exports.runtimeWindow.$RefreshReg$', context)
        assert.throws(() => runInNewContext('exports.evaluateBoundary()', context), /can't detect preamble/)
    })
}

test('appends the preamble without rewriting existing runtime code', () => {
    const code = 'window.__registerBeforePerformReactRefresh = callback'
    const transformed = transformRefreshRuntime(code)
    assert.ok(transformed.code.startsWith(`${code}\ninjectIntoGlobalHook(globalThis);`))
    assert.match(transformed.code, /window\.\$RefreshReg\$ = \(\) => \{\};/)
    assert.match(transformed.code, /window\.\$RefreshSig\$ = \(\) => \(type\) => type;/)
    assert.equal(transformed.map, null)
})

test('routes the runtime bootstrap by exact module ID without a guard-removal plugin', async () => {
    const plugins = createMiniReactRefreshTransforms()
    assert.equal(plugins.length, 2)
    const plugin = plugins[0]
    assert.ok(plugin)
    assert.equal(plugin.apply, 'serve')
    const hook = plugin.transform
    assert.ok(hook && typeof hook === 'object')
    assert.equal(hook.order, 'post')
    const filter = hook.filter?.id
    assert.ok(filter instanceof RegExp)
    assert.equal(filter.test('/@react-refresh'), true)
    assert.equal(filter.test('/@react-refresh?v=1'), true)
    assert.equal(filter.test('/src/@react-refresh.js'), false)
    const code = 'window.__registerBeforePerformReactRefresh = callback'
    assert.deepEqual(await Reflect.apply(hook.handler, {}, [code, '/@react-refresh']), transformRefreshRuntime(code))
})

test('orders React Refresh before renderer injection', async () => {
    const hook = createMiniReactRefreshTransforms()[1]?.transform
    assert.ok(hook && typeof hook === 'object')
    const filter = hook.filter?.id
    assert.ok(filter instanceof RegExp)
    const rendererId = normalizePath(
        path.join(
            path.dirname(packageRequire.resolve('react-reconciler/package.json')),
            'cjs/react-reconciler.development.js'
        )
    )
    assert.equal(filter.test(rendererId), true)
    assert.equal(filter.test(`${rendererId}?v=1`), true)
    assert.equal(filter.test('/project/other-renderer.js'), false)
    const code = 'const rendererID = hook.inject(internals)'
    const result = injectReactRefreshRendererDependency(code)
    assert.deepEqual(result, { code: `import '/@react-refresh'\n${code}`, map: null })
    assert.deepEqual(await Reflect.apply(hook.handler, {}, [code, rendererId]), result)
    assert.throws(() => injectReactRefreshRendererDependency('export const renderer = {}'), /must inject its renderer/)
})

test('lowers only free React DevTools hook references through the development Oxc define', async () => {
    const defines = createMiniReactRefreshDefines(true)
    const transformed = await transformWithOxc(
        `
            const available = typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined'
            const explicit = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__
            const record = { __REACT_DEVTOOLS_GLOBAL_HOOK__: explicit }
            function readShadow(__REACT_DEVTOOLS_GLOBAL_HOOK__) {
                return __REACT_DEVTOOLS_GLOBAL_HOOK__
            }
        `,
        'react-renderer.js',
        { define: defines, sourcemap: false }
    )
    assert.deepEqual(createMiniReactRefreshDefines(false), {})
    assert.equal(defines.__REACT_DEVTOOLS_GLOBAL_HOOK__, 'globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__')
    assert.match(transformed.code, /typeof globalThis\.__REACT_DEVTOOLS_GLOBAL_HOOK__/)
    assert.doesNotMatch(transformed.code, /globalThis\.globalThis/)
    assert.match(transformed.code, /__REACT_DEVTOOLS_GLOBAL_HOOK__: explicit/)
    assert.match(transformed.code, /function readShadow\(__REACT_DEVTOOLS_GLOBAL_HOOK__\)/)
    assert.match(transformed.code, /return __REACT_DEVTOOLS_GLOBAL_HOOK__;/)
})
