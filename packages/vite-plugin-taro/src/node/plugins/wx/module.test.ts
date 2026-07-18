import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { bootstrapPath, getWxModuleKind, rolldownRuntimeId, transportPath } from './module.ts'

function chunk({ moduleIds, isEntry = false }: { moduleIds: readonly string[]; isEntry?: boolean }) {
    return { moduleIds, isEntry } as Rolldown.PreRenderedChunk
}

test('classifies native, capsule, and amphibious WX modules', () => {
    assert.equal(getWxModuleKind(chunk({ moduleIds: ['/application'] })), 'capsule')
    assert.equal(getWxModuleKind(chunk({ moduleIds: ['/shell'], isEntry: true })), 'native')
    assert.equal(getWxModuleKind(chunk({ moduleIds: [transportPath], isEntry: true })), 'native')
    assert.equal(getWxModuleKind(chunk({ moduleIds: [bootstrapPath] })), 'amphibious')
    assert.equal(getWxModuleKind(chunk({ moduleIds: [rolldownRuntimeId] })), 'amphibious')
})

test('lets amphibious identity take precedence over entry identity', () => {
    assert.equal(getWxModuleKind(chunk({ moduleIds: [bootstrapPath], isEntry: true })), 'amphibious')
})
