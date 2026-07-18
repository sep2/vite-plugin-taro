import assert from 'node:assert/strict'
import test from 'node:test'
import { rewriteReactRefresh } from './react-refresh.ts'

test('keeps React Refresh extension state private to its runtime module', async () => {
    const transformed = rewriteReactRefresh(
        `window.__registerBeforePerformReactRefresh = (callback) => callback()
const ignored = window.__getReactRefreshIgnoredExports?.({ id: 'test' }) ?? []`,
        '/@react-refresh',
        false
    )
    if (!transformed) throw new Error('Expected the React Refresh runtime to be rewritten.')
    const result = transformed.code

    assert.equal(transformed.map, null)
    assert.match(result, /const __vptReactRefreshHost=\{\}/)
    assert.doesNotMatch(result, /window\.__registerBeforePerformReactRefresh/)
    assert.doesNotMatch(result, /window\.__getReactRefreshIgnoredExports/)
})

test('removes only the generated browser preamble guard', async () => {
    const transformed = rewriteReactRefresh(
        `if (!window.$RefreshReg$) {
    throw new Error("@vitejs/plugin-react can't detect preamble. Something is wrong.")
}
const userWindow = window.location`,
        '/src/component.tsx'
    )
    if (!transformed) throw new Error('Expected the React Refresh boundary to be rewritten.')
    const result = transformed.code

    assert.doesNotMatch(result, /can't detect preamble/)
    assert.match(result, /window\.location/)
})
