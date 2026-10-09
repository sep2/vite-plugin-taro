import assert from 'node:assert/strict'
import test from 'node:test'
import * as client from './vite-client.ts'

test('exposes inert browser-style operations for native stylesheet ownership', () => {
    assert.deepEqual(Object.keys(client).sort(), ['removeStyle', 'updateStyle'])
    assert.equal(client.updateStyle(), undefined)
    assert.equal(client.removeStyle(), undefined)
})
