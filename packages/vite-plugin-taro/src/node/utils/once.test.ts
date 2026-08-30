import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from './once.ts'

test('runs once and returns the first result for every later call', () => {
    // Mutable only to prove that repeated wrapper calls do not repeat the underlying effect.
    let calls = 0
    const initialize = once((value: string) => {
        calls++
        return { value: value }
    })

    const first = initialize('first')
    const second = initialize('second')

    assert.equal(calls, 1)
    assert.equal(second, first)
    assert.deepEqual(second, { value: 'first' })
})
