import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import type { RuntimeModulesContract } from '../mini-contract.ts'
import { createMiniModuleClassifier, rolldownRuntimeId } from './module.ts'

const modules: RuntimeModulesContract = {
    bootstrap: '/runtime/bootstrap',
    transport: '/runtime/transport',
    appShell: '/runtime/app-shell',
    appCapsule: '/runtime/app-capsule',
    componentShell: '/runtime/component-shell',
    componentCapsule: '/runtime/component-capsule',
    customWrapperShell: '/runtime/custom-wrapper-shell',
    pageShell: '/runtime/page-shell',
    pageCapsule: '/runtime/page-capsule',
    devtoolsHmrRuntime: '/runtime/devtools-hmr',
    interpreterHmrRuntime: '/runtime/interpreter-hmr'
}

const classifyModule = createMiniModuleClassifier(modules)

function chunk(...moduleIds: string[]): Rolldown.PreRenderedChunk {
    return { moduleIds } as Rolldown.PreRenderedChunk
}

test('identifies shell and capsule entry roles independently from output execution', () => {
    assert.equal(classifyModule(chunk(modules.appShell)).entryRole, 'shell')
    assert.equal(classifyModule(chunk(modules.appCapsule)).entryRole, 'capsule')
    assert.equal(classifyModule(chunk(modules.customWrapperShell)).entryRole, 'shell')
    assert.equal(classifyModule(chunk(`${modules.pageCapsule}?route=page`)).entryRole, 'capsule')
    assert.equal(classifyModule(chunk('/application')).entryRole, undefined)
    assert.throws(() => classifyModule(chunk(modules.appShell, modules.appCapsule)), /mixes shell and capsule entries/)
})

test('classifies native, capsule, amphibious, and transport execution in one pass', () => {
    assert.deepEqual(classifyModule(chunk('/application')), {
        entryRole: undefined,
        executionKind: 'capsule',
        isTransport: false
    })
    assert.equal(classifyModule(chunk(modules.appShell)).executionKind, 'native')
    assert.deepEqual(classifyModule(chunk(modules.transport)), {
        entryRole: undefined,
        executionKind: 'native',
        isTransport: true
    })
    assert.equal(classifyModule(chunk(modules.appCapsule)).executionKind, 'capsule')
    assert.equal(classifyModule(chunk(modules.bootstrap)).executionKind, 'amphibious')
    assert.equal(classifyModule(chunk(rolldownRuntimeId)).executionKind, 'amphibious')
    assert.equal(classifyModule(chunk(modules.appCapsule, rolldownRuntimeId)).executionKind, 'amphibious')
})
