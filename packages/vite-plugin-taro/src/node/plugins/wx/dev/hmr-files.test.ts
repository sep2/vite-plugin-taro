import assert from 'node:assert/strict'
import test from 'node:test'
import { renderHmrInfo, renderHmrUpdate, renderInitialHmrUpdate } from './hmr-files.ts'
import type { UpdatePublication } from './topology/types.ts'

test('renders immutable CommonJS bootstrap files', () => {
    assert.equal(
        renderHmrInfo({ buildId: 'build-1', endpoint: 'http://localhost/__vpt_hmr__', token: 'secret' }),
        'module.exports = Object.freeze({"buildId":"build-1","endpoint":"http://localhost/__vpt_hmr__","token":"secret"});\n'
    )
    assert.equal(renderInitialHmrUpdate(), 'module.exports = undefined;\n')
})

test('renders a contiguous physical patch range with runtime-owned version metadata', () => {
    const source = renderHmrUpdate(publication())

    assert.match(source, /publication 7/)
    assert.match(source, /"fromVersion":0/)
    assert.match(source, /"targetVersion":2/)
    assert.match(source, /const __rolldown_runtime__ = global\.__rolldown_runtime__;/)
    assert.match(source, /__rolldown_runtime__\.applyPublication/)
    assert.match(source, /first patch/)
    assert.match(source, /second patch/)
})

test('rejects empty and non-contiguous physical publications', () => {
    assert.throws(() => renderHmrUpdate({ ...publication(), patches: [] }), /empty or non-contiguous/)
    assert.throws(
        () =>
            renderHmrUpdate({
                ...publication(),
                patches: [
                    { patch: { code: 'first', fileName: 'first.js' }, version: 1 },
                    { patch: { code: 'third', fileName: 'third.js' }, version: 3 }
                ]
            }),
        /non-contiguous/
    )
})

function publication(): UpdatePublication {
    return {
        buildId: 'build-1',
        clientId: 'client-a',
        patches: [
            { patch: { code: 'first patch', fileName: 'first.js' }, version: 1 },
            { patch: { code: 'second patch', fileName: 'second.js' }, version: 2 }
        ],
        publicationId: 7,
        requestId: 'request-1'
    }
}
