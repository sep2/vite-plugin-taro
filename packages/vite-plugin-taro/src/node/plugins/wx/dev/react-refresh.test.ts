import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    createWxReactRefreshTransforms,
    injectReactRefreshRendererDependency,
    removeRefreshPreambleGuard,
    transformReactDevtoolsHook,
    transformRefreshRuntime
} from './react-refresh.ts'

test('adapts the refresh runtime to the WeChat global object', () => {
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
    assert.match(transformed.code, /global\.__registerBeforePerformReactRefresh/)
    assert.match(transformed.code, /global\.__getReactRefreshIgnoredExports/)
    assert.match(transformed.code, /performReactRefresh\(\)/)
    assert.doesNotMatch(transformed.code, /finishReactRefresh/)
    assert.match(transformed.code, /injectIntoGlobalHook\(global\);$/)
})

test('orders React Refresh before renderer injection', () => {
    const transformed = injectReactRefreshRendererDependency('const rendererID = hook.inject(internals)')

    assert.match(transformed.code, /^import '\/@react-refresh'/)
    assert.equal(transformed.map, null)
})

test('rejects a Reconciler without the renderer injection contract', () => {
    assert.throws(() => injectReactRefreshRendererDependency('export const renderer = {}'), /must inject its renderer/)
})

test('rewrites only reference uses of the React DevTools hook in an admitted module', () => {
    const transformed = transformReactDevtoolsHook({
        code: `
            const available = typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined'
            const explicit = global.__REACT_DEVTOOLS_GLOBAL_HOOK__
            const record = { __REACT_DEVTOOLS_GLOBAL_HOOK__: explicit }
        `,
        id: 'react-renderer.js'
    })

    assert.match(transformed.code, /typeof global\.__REACT_DEVTOOLS_GLOBAL_HOOK__/)
    assert.doesNotMatch(transformed.code, /typeof __REACT_DEVTOOLS_GLOBAL_HOOK__/)
    assert.match(transformed.code, /__REACT_DEVTOOLS_GLOBAL_HOOK__: explicit/)
})

test('routes renderer and preamble plugin hooks through their exact IDs', async () => {
    const transforms = createWxReactRefreshTransforms()
    assert.equal(transforms.length, 4)
    const rendererHook = transforms[1]?.transform
    const preambleHook = transforms[3]?.transform
    assert.ok(rendererHook)
    assert.ok(preambleHook)
    const renderer = typeof rendererHook === 'function' ? rendererHook : rendererHook.handler
    const preamble = typeof preambleHook === 'function' ? preambleHook : preambleHook.handler

    assert.equal(await Reflect.apply(renderer, {}, ['const renderer = {}', '/project/other-renderer.js']), undefined)
    const transformed = await Reflect.apply(preamble, {}, [
        "if (!window.$RefreshReg$) throw new Error('missing preamble')",
        'boundary.js'
    ])
    assert.ok(transformed && typeof transformed === 'object' && 'code' in transformed)
    assert.doesNotMatch(String(transformed.code), /missing preamble/)
})

test('structurally removes only the web refresh preamble guard', () => {
    const transformed = removeRefreshPreambleGuard({
        code: `
            if (!window.$RefreshReg$) throw new Error('missing preamble')
            if (!window.otherProtocol) throw new Error('preserved')
            render()
        `,
        id: 'boundary.js'
    })

    assert.doesNotMatch(transformed.code, /missing preamble/)
    assert.match(transformed.code, /window\.otherProtocol/)
    assert.match(transformed.code, /render\(\)/)
})
