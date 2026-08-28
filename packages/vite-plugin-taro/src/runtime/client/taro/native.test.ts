import assert from 'node:assert/strict'
import test from 'node:test'
import { defineNativeComponent } from './native.ts'

test('fails clearly when the native component interface was not compiled', () => {
    assert.throws(
        () =>
            defineNativeComponent(() => {
                throw new Error('The runtime must not load the native component entry')
            }),
        /Native component interface was not compiled/
    )
})
