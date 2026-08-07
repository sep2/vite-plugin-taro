import assert from 'node:assert/strict'
import { test } from 'node:test'
import { removeRefreshPreambleGuard, transformReactDevtoolsHook, transformRefreshRuntime } from './react-refresh.ts'

test('adapts the refresh runtime to the WeChat global object', () => {
    const transformed = transformRefreshRuntime({
        code: `
            function injectIntoGlobalHook(target) { return target }
            window.__registerBeforePerformReactRefresh = callback
            const ignored = window.__getReactRefreshIgnoredExports
        `,
        id: '/@react-refresh'
    })

    assert.doesNotMatch(transformed.code, /window\.__/)
    assert.match(transformed.code, /global\.__registerBeforePerformReactRefresh/)
    assert.match(transformed.code, /global\.__getReactRefreshIgnoredExports/)
    assert.match(transformed.code, /injectIntoGlobalHook\(global\);$/)
})

test('rewrites only reference uses of the React DevTools hook', () => {
    const transformed = transformReactDevtoolsHook({
        code: `
            const available = typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined'
            const explicit = global.__REACT_DEVTOOLS_GLOBAL_HOOK__
            const record = { __REACT_DEVTOOLS_GLOBAL_HOOK__: explicit }
        `,
        id: 'react-renderer.js'
    })

    assert.match(transformed.code, /typeof global\.__REACT_DEVTOOLS_GLOBAL_HOOK__/)
    assert.match(transformed.code, /global\.__REACT_DEVTOOLS_GLOBAL_HOOK__\n/)
    assert.match(transformed.code, /\{ __REACT_DEVTOOLS_GLOBAL_HOOK__: explicit \}/)
})

test('removes only the web refresh preamble guard', () => {
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
