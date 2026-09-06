import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { normalizePath, transformWithOxc } from 'vite'
import { packageRequire } from '../../../utils/packages.ts'
import {
    createMiniReactRefreshDefines,
    createMiniReactRefreshTransforms,
    injectReactRefreshRendererDependency,
    removeRefreshPreambleGuard,
    transformRefreshRuntime
} from './react-refresh.ts'

test('adapts the refresh runtime to the Mini Program JavaScript global', () => {
    const transformed = transformRefreshRuntime({
        code: `
            function injectIntoGlobalHook(target) { return target }
            function performReactRefresh() {}
            window.__registerBeforePerformReactRefresh = callback
            const ignored = window.__getReactRefreshIgnoredExports
            performReactRefresh()
        `,
        id: '/@react-refresh'
    })

    assert.doesNotMatch(transformed.code, /window\.__/)
    assert.match(transformed.code, /globalThis\.__registerBeforePerformReactRefresh/)
    assert.match(transformed.code, /globalThis\.__getReactRefreshIgnoredExports/)
    assert.match(transformed.code, /performReactRefresh\(\)/)
    assert.doesNotMatch(transformed.code, /finishReactRefresh/)
    assert.match(transformed.code, /injectIntoGlobalHook\(globalThis\);$/)
})

test('removes browser guards before complete and incremental rendering', () => {
    const guard = `if (!window.$RefreshReg$) { throw new Error("@vitejs/plugin-react can't detect preamble. Something is wrong.") }`
    for (const code of [guard, `function factory() { ${guard}; $RefreshReg$(Component, 'Component') }`]) {
        const result = removeRefreshPreambleGuard({ code, id: '/src/component.jsx' })
        assert.doesNotMatch(result.code, /can't detect preamble/)
    }
    const unrelated = 'if (!window.$RefreshReg$) { reportMissing() }'
    assert.equal(removeRefreshPreambleGuard({ code: unrelated, id: '/src/other.js' }).code, unrelated)
    const plugin = createMiniReactRefreshTransforms().find((entry) => entry.name === 'vpt:mini-refresh-preamble-guard')
    assert.ok(plugin)
    assert.equal(plugin.apply, 'serve')
    assert.ok(plugin.transform && typeof plugin.transform === 'object')
    assert.equal(plugin.transform.order, 'post')
    assert.deepEqual(plugin.transform.filter, { code: /window\.\$RefreshReg\$/ })
})

test('preserves assertions that do not match the generated preamble guard', () => {
    const error = `new Error("@vitejs/plugin-react can't detect preamble. Something is wrong.")`
    const statements = [
        `if (!window.$RefreshReg$) throw ${error}`,
        'if (!window.$RefreshReg$) {}',
        `if (!window.$RefreshReg$) { reportMissing(); throw ${error} }`,
        `if (!window.$RefreshReg$) { throw ${error} } else { recover() }`,
        `if (window.$RefreshReg$) { throw ${error} }`,
        `if (+window.$RefreshReg$) { throw ${error} }`,
        `if (!ready) { throw ${error} }`,
        `if (!window['$RefreshReg$']) { throw ${error} }`,
        `if (!getWindow().$RefreshReg$) { throw ${error} }`,
        `if (!globalThis.$RefreshReg$) { throw ${error} }`,
        `if (!window.other) { throw ${error} }`,
        'if (!window.$RefreshReg$) { reportMissing() }',
        'if (!window.$RefreshReg$) { throw error }',
        'if (!window.$RefreshReg$) { throw new errors.Error() }',
        'if (!window.$RefreshReg$) { throw new TypeError() }',
        'if (!window.$RefreshReg$) { throw new Error() }',
        'if (!window.$RefreshReg$) { throw new Error("message", options) }',
        'if (!window.$RefreshReg$) { throw new Error(message) }',
        'if (!window.$RefreshReg$) { throw new Error("unrelated") }'
    ]

    for (const code of statements) {
        assert.equal(removeRefreshPreambleGuard({ code, id: '/src/other.js' }).code, code)
    }
})

test('preserves unrelated browser accesses in the refresh runtime', () => {
    const code = `
        window.unrelated = true
        window['__registerBeforePerformReactRefresh'] = callback
        globalThis.__getReactRefreshIgnoredExports
        getWindow().__getReactRefreshIgnoredExports
        const name = 'window.__getReactRefreshIgnoredExports'
    `
    assert.equal(
        transformRefreshRuntime({ code, id: '/@react-refresh' }).code,
        `${code}\ninjectIntoGlobalHook(globalThis);`
    )
})

test('routes and caches the refresh runtime transform by source bytes', async () => {
    const plugin = createMiniReactRefreshTransforms()[0]
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
    const result = await Reflect.apply(hook.handler, {}, [code, '/@react-refresh'])
    assert.deepEqual(result, transformRefreshRuntime({ code, id: '/@react-refresh' }))
    assert.equal(await Reflect.apply(hook.handler, {}, [code, '/@react-refresh?v=1']), result)
    const changed = 'const ignored = window.__getReactRefreshIgnoredExports'
    const updated = await Reflect.apply(hook.handler, {}, [changed, '/@react-refresh'])
    assert.notEqual(updated, result)
    assert.deepEqual(updated, transformRefreshRuntime({ code: changed, id: '/@react-refresh' }))
})

test('removes the preamble assertion through the plugin transform hook', async () => {
    const hook = createMiniReactRefreshTransforms()[2]?.transform
    assert.ok(hook && typeof hook === 'object')
    const registration = "$RefreshReg$(Component, 'Component')"
    const code = `if (!window.$RefreshReg$) { throw new Error("@vitejs/plugin-react can't detect preamble. Something is wrong.") }\n${registration}`
    const result = await Reflect.apply(hook.handler, {}, [code, '/src/component.jsx'])
    assert.ok(result && typeof result === 'object' && 'code' in result)
    assert.equal(result.code, `\n${registration}`)
})

test('orders React Refresh before renderer injection', () => {
    const transformed = injectReactRefreshRendererDependency('const rendererID = hook.inject(internals)')

    assert.match(transformed.code, /^import '\/@react-refresh'/)
    assert.equal(transformed.map, null)
})

test('rejects a Reconciler without the renderer injection contract', () => {
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

test('routes the renderer plugin hook through its exact ID', async () => {
    const transforms = createMiniReactRefreshTransforms()
    assert.equal(transforms.length, 3)
    const rendererHook = transforms[1]?.transform
    assert.ok(rendererHook && typeof rendererHook === 'object')
    const rendererIdFilter = rendererHook.filter?.id
    assert.ok(rendererIdFilter instanceof RegExp)
    const rendererId = normalizePath(
        path.join(
            path.dirname(packageRequire.resolve('react-reconciler/package.json')),
            'cjs/react-reconciler.development.js'
        )
    )
    assert.equal(rendererIdFilter.test(rendererId), true)
    assert.equal(rendererIdFilter.test(`${rendererId}?v=1`), true)
    assert.equal(rendererIdFilter.test('/project/other-renderer.js'), false)
    const rendererResult = await Reflect.apply(rendererHook.handler, {}, [
        'const rendererID = hook.inject(internals)',
        rendererId
    ])
    assert.ok(rendererResult && typeof rendererResult === 'object' && 'code' in rendererResult)
    assert.match(String(rendererResult.code), /^import '\/@react-refresh'/)
})
