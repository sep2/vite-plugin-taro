import assert from 'node:assert/strict'
import test from 'node:test'
import type { RuntimeModulesContract } from '../mini-contract.ts'
import { createMiniHmrMode } from './hmr-mode.ts'

const modules: RuntimeModulesContract = {
    bootstrap: '/runtime/bootstrap',
    transport: '/runtime/transport',
    appShell: '/runtime/app-shell',
    appCapsule: '/runtime/app-capsule',
    componentShell: '/runtime/component-shell',
    componentCapsule: '/runtime/component-capsule',
    customWrapperShell: '/runtime/custom-wrapper-shell',
    pageShell: '/runtime/native/page.ts',
    pageCapsule: '/runtime/page-capsule',
    devtoolsHmrRuntime: '/runtime/devtools-runtime.ts',
    interpreterHmrRuntime: '/runtime/interpreter-runtime.ts'
}

test('defaults to DevTools and resolves every public update mode', () => {
    const defaultMode = createMiniHmrMode(undefined, modules)
    const devtoolsMode = createMiniHmrMode({ mode: 'devtools' }, modules)
    const interpreterMode = createMiniHmrMode({ mode: 'interpreter' }, modules)
    const rebuildMode = createMiniHmrMode({ mode: 'rebuild' }, modules)

    assert.equal(defaultMode.rebuildStrategy, 'on-failure')
    assert.equal(devtoolsMode.rebuildStrategy, 'on-failure')
    assert.equal(interpreterMode.rebuildStrategy, 'on-failure')
    assert.equal(rebuildMode.rebuildStrategy, 'always')
    assert.match(defaultMode.runtimeFile, /devtools-runtime\.(?:ts|js)$/)
    assert.match(devtoolsMode.runtimeFile, /devtools-runtime\.(?:ts|js)$/)
    assert.match(interpreterMode.runtimeFile, /interpreter-runtime\.(?:ts|js)$/)
    assert.match(rebuildMode.runtimeFile, /devtools-runtime\.(?:ts|js)$/)
})
