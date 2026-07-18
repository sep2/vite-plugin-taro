import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { transportPath } from '../native/constant.ts'
import { createPlacer } from './placer.ts'

function chunk(...moduleIds: string[]): Rolldown.PreRenderedChunk {
    return { moduleIds } as Rolldown.PreRenderedChunk
}

test('places the initial WX chunk graph in the main package', () => {
    const placer = createPlacer()
    const applicationChunk = chunk('/application')

    assert.deepEqual(placer.locateChunk(applicationChunk), { kind: 'main' })
    assert.equal(placer.getLoadMode(applicationChunk), 'sync')
    assert.equal(placer.chunkFileNames(), 'assets/[name]-[hash].js')
})

test('hashes transport while preserving exact native entry paths', () => {
    const placer = createPlacer()

    assert.equal(placer.entryFileNames(chunk(transportPath)), 'assets/[name]-[hash].js')
    assert.equal(placer.entryFileNames(chunk('/native-shell')), '[name]')
})
