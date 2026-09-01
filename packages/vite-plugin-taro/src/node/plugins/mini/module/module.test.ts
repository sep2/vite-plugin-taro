import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import {
    appCapsulePath,
    appShellPath,
    bootstrapPath,
    customWrapperShellPath,
    getMiniEntryRole,
    getMiniExecutionKind,
    pageCapsulePath,
    rolldownRuntimeId,
    transportPath
} from './module.ts'

function chunk(...moduleIds: string[]): Rolldown.PreRenderedChunk {
    return { moduleIds } as Rolldown.PreRenderedChunk
}

test('identifies shell and capsule entry roles independently from output execution', () => {
    assert.equal(getMiniEntryRole(chunk(appShellPath)), 'shell')
    assert.equal(getMiniEntryRole(chunk(appCapsulePath)), 'capsule')
    assert.equal(getMiniEntryRole(chunk(customWrapperShellPath)), 'shell')
    assert.equal(getMiniEntryRole(chunk(`${pageCapsulePath}?route=page`)), 'capsule')
    assert.equal(getMiniEntryRole(chunk('/application')), undefined)
    assert.throws(() => getMiniEntryRole(chunk(appShellPath, appCapsulePath)), /mixes shell and capsule entries/)
})

test('classifies native, capsule, and amphibious execution domains', () => {
    assert.equal(getMiniExecutionKind(chunk('/application')), 'capsule')
    assert.equal(getMiniExecutionKind(chunk(appShellPath)), 'native')
    assert.equal(getMiniExecutionKind(chunk(transportPath)), 'native')
    assert.equal(getMiniExecutionKind(chunk(appCapsulePath)), 'capsule')
    assert.equal(getMiniExecutionKind(chunk(bootstrapPath)), 'amphibious')
    assert.equal(getMiniExecutionKind(chunk(rolldownRuntimeId)), 'amphibious')
    assert.equal(getMiniExecutionKind(chunk(appCapsulePath, rolldownRuntimeId)), 'amphibious')
})
