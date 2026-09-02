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

test('defaults to DevTools and resolves each public mode', () => {
    assert.match(createMiniHmrMode(undefined, modules).runtimeFile, /devtools-runtime\.(?:ts|js)$/)
    assert.match(createMiniHmrMode({ mode: 'devtools' }, modules).runtimeFile, /devtools-runtime\.(?:ts|js)$/)
    assert.match(createMiniHmrMode({ mode: 'interpreter' }, modules).runtimeFile, /interpreter-runtime\.(?:ts|js)$/)
})
