import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import {
    appCapsulePath,
    appShellPath,
    bootstrapPath,
    customWrapperShellPath,
    getWxEntryRole,
    getWxExecutionKind,
    pageCapsulePath,
    rolldownRuntimeId,
    transportPath
} from './module.ts'

function chunk(...moduleIds: string[]): Rolldown.PreRenderedChunk {
    return { moduleIds } as Rolldown.PreRenderedChunk
}

test('identifies shell and capsule entry roles independently from output execution', () => {
    assert.equal(getWxEntryRole(chunk(appShellPath)), 'shell')
    assert.equal(getWxEntryRole(chunk(appCapsulePath)), 'capsule')
    assert.equal(getWxEntryRole(chunk(customWrapperShellPath)), 'shell')
    assert.equal(getWxEntryRole(chunk(`${pageCapsulePath}?route=page`)), 'capsule')
    assert.equal(getWxEntryRole(chunk('/application')), undefined)
    assert.throws(() => getWxEntryRole(chunk(appShellPath, appCapsulePath)), /mixes shell and capsule entries/)
})

test('classifies native, capsule, and amphibious execution domains', () => {
    assert.equal(getWxExecutionKind(chunk('/application')), 'capsule')
    assert.equal(getWxExecutionKind(chunk(appShellPath)), 'native')
    assert.equal(getWxExecutionKind(chunk(transportPath)), 'native')
    assert.equal(getWxExecutionKind(chunk(appCapsulePath)), 'capsule')
    assert.equal(getWxExecutionKind(chunk(bootstrapPath)), 'amphibious')
    assert.equal(getWxExecutionKind(chunk(rolldownRuntimeId)), 'amphibious')
    assert.equal(getWxExecutionKind(chunk(appCapsulePath, rolldownRuntimeId)), 'amphibious')
})
