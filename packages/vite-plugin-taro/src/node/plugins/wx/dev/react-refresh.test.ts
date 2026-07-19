import assert from 'node:assert/strict'
import test from 'node:test'
import { rewriteReactRefresh } from './react-refresh.ts'

test('connects the React Refresh runtime to the App-owned completion host', () => {
    const transformed = rewriteReactRefresh(
        `
window.__registerBeforePerformReactRefresh = (callback) => callback()
const enqueueUpdate = () => {}
function performReactRefresh() {}
function validate() { enqueueUpdate() }
function flush() { performReactRefresh() }
const ignored = window.__getReactRefreshIgnoredExports?.({ id: 'module' })
`,
        '/@react-refresh',
        false
    )

    assert.ok(transformed)
    assert.match(transformed.code, /const __vptReactRefreshHost\s*=\s*global\.__vptReactRefreshHost/)
    assert.doesNotMatch(transformed.code, /window\.__registerBeforePerformReactRefresh/)
    assert.doesNotMatch(transformed.code, /window\.__getReactRefreshIgnoredExports/)
    assert.match(transformed.code, /__vptReactRefreshHost\.enqueueRefresh\(enqueueUpdate\)/)
    assert.match(transformed.code, /__vptReactRefreshHost\.performReactRefresh\(performReactRefresh\)/)
})

test('removes only the generated browser preamble guard from refresh boundaries', () => {
    const transformed = rewriteReactRefresh(
        `
if (!window.$RefreshReg$) {
    throw new Error("@vitejs/plugin-react can't detect preamble. Something is wrong.")
}
if (!window.userValue) throw new Error('user guard')
`,
        '/src/component.tsx',
        false
    )

    assert.ok(transformed)
    assert.doesNotMatch(transformed.code, /\$RefreshReg\$/)
    assert.match(transformed.code, /window\.userValue/)
})
