import assert from 'node:assert/strict'
import test from 'node:test'
import { createMiniHmrMode } from './hmr-mode.ts'

test('defaults to DevTools and resolves each public mode', () => {
    assert.match(createMiniHmrMode(undefined).runtimeFile, /devtools-runtime\.(?:ts|js)$/)
    assert.match(createMiniHmrMode({ mode: 'devtools' }).runtimeFile, /devtools-runtime\.(?:ts|js)$/)
    assert.match(createMiniHmrMode({ mode: 'interpreter' }).runtimeFile, /interpreter-runtime\.(?:ts|js)$/)
})
