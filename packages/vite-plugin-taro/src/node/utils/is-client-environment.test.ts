import assert from 'node:assert/strict'
import test from 'node:test'
import { isClientEnvironment } from './is-client-environment.ts'

test('assigns application entry and output ownership to the client environment', () => {
    assert.equal(isClientEnvironment({ name: 'client' }), true)
    assert.equal(isClientEnvironment({ name: 'ssr' }), false)
})
