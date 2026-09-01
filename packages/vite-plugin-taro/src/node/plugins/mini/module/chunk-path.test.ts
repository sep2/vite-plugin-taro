import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveLogicalChunkReference, resolvePhysicalChunkReference, toLogicalChunkId } from './chunk-path.ts'

test('projects Rolldown physical chunk paths into package-neutral SystemJS IDs', () => {
    assert.equal(toLogicalChunkId('assets/app-capsule.js'), 'app-capsule.js')
    assert.equal(toLogicalChunkId('assets/pages/home-capsule.js'), 'pages/home-capsule.js')
})

test('keeps physical reference resolution separate from logical identity projection', () => {
    assert.equal(resolvePhysicalChunkReference('assets/pages/home.js', '../shared.js'), 'assets/shared.js')
    assert.equal(resolveLogicalChunkReference('assets/pages/home.js', '../shared.js'), 'shared.js')
})

test('rejects chunk references that are not relative to their importer', () => {
    assert.throws(
        () => resolvePhysicalChunkReference('assets/pages/home.js', 'shared.js'),
        /Expected a relative chunk reference in assets\/pages\/home\.js: shared\.js/
    )
})
