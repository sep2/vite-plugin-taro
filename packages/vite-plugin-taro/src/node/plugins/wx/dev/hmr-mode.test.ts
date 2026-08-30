import assert from 'node:assert/strict'
import test from 'node:test'
import { createWxHmrMode } from './hmr-mode.ts'

test('defaults to DevTools and resolves each public mode', () => {
    assert.match(createWxHmrMode(undefined).runtimeFile, /devtools-runtime\.(?:ts|js)$/)
    assert.match(createWxHmrMode({ mode: 'devtools' }).runtimeFile, /devtools-runtime\.(?:ts|js)$/)
    assert.match(createWxHmrMode({ mode: 'interpreter' }).runtimeFile, /interpreter-runtime\.(?:ts|js)$/)
})
