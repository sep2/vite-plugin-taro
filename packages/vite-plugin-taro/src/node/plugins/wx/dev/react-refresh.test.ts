import assert from 'node:assert/strict'
import test from 'node:test'
import type { Plugin } from 'vite'
import { createWxReactRefreshPlugin } from './react-refresh.ts'

test('keeps React Refresh extension state private to its runtime module', async () => {
    const result = await runTransform(
        createWxReactRefreshPlugin(),
        `window.__registerBeforePerformReactRefresh = (callback) => callback()
const ignored = window.__getReactRefreshIgnoredExports?.({ id: 'test' }) ?? []`,
        '/@react-refresh'
    )

    assert.match(result, /const __vptReactRefreshHost=\{\}/)
    assert.doesNotMatch(result, /window\.__registerBeforePerformReactRefresh/)
    assert.doesNotMatch(result, /window\.__getReactRefreshIgnoredExports/)
})

test('removes only the generated browser preamble guard', async () => {
    const result = await runTransform(
        createWxReactRefreshPlugin(),
        `if (!window.$RefreshReg$) {
    throw new Error("@vitejs/plugin-react can't detect preamble. Something is wrong.")
}
const userWindow = window.location`,
        '/src/component.tsx'
    )

    assert.doesNotMatch(result, /can't detect preamble/)
    assert.match(result, /window\.location/)
})

async function runTransform(plugin: Plugin, code: string, id: string): Promise<string> {
    const hook = plugin.transform
    if (!hook) throw new Error('Expected transform hook.')
    const handler = typeof hook === 'function' ? hook : hook.handler
    const result = await handler.call({} as never, code, id)
    if (!result) throw new Error(`Expected ${id} to be transformed.`)
    if (typeof result === 'string') return result
    if (typeof result.code !== 'string') throw new Error(`Expected ${id} transform to return code.`)
    return result.code
}
