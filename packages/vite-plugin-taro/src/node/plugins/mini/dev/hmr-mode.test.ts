import assert from 'node:assert/strict'
import test from 'node:test'
import type { RuntimeContract } from '../mini-contract.ts'
import { createMiniHmrMode } from './hmr-mode.ts'

const runtime: RuntimeContract = {
    devtoolsHmrRuntime: '/runtime/devtools-runtime.ts',
    interpreterHmrRuntime: '/runtime/interpreter-runtime.ts'
}

test('defaults to DevTools and resolves every public update mode', () => {
    const defaultMode = createMiniHmrMode(undefined, runtime)
    const devtoolsMode = createMiniHmrMode({ mode: 'devtools' }, runtime)
    const interpreterMode = createMiniHmrMode({ mode: 'interpreter' }, runtime)
    const rebuildMode = createMiniHmrMode({ mode: 'rebuild' }, runtime)

    assert.equal(defaultMode.rebuildStrategy, 'on-failure')
    assert.equal(devtoolsMode.rebuildStrategy, 'on-failure')
    assert.equal(interpreterMode.rebuildStrategy, 'on-failure')
    assert.equal(rebuildMode.rebuildStrategy, 'always')
    assert.match(defaultMode.runtimeFile, /devtools-runtime\.(?:ts|js)$/)
    assert.match(devtoolsMode.runtimeFile, /devtools-runtime\.(?:ts|js)$/)
    assert.match(interpreterMode.runtimeFile, /interpreter-runtime\.(?:ts|js)$/)
    assert.match(rebuildMode.runtimeFile, /devtools-runtime\.(?:ts|js)$/)
})
