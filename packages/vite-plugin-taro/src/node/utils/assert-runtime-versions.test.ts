import assert from 'node:assert/strict'
import test from 'node:test'
import { rolldownVersion, version as viteVersion } from 'vite'
import { assertRuntimeVersions, assertRuntimeVersionValues } from './assert-runtime-versions.ts'

test('accepts the installed Vite and Rolldown versions', () => {
    assert.doesNotThrow(assertRuntimeVersions)
})

test('rejects a mismatched Vite version', () => {
    assert.throws(
        () => assertRuntimeVersionValues('0.0.0', rolldownVersion),
        /requires vite@.+, but found vite@0\.0\.0/
    )
})

test('rejects a mismatched Rolldown version', () => {
    assert.throws(
        () => assertRuntimeVersionValues(viteVersion, '0.0.0'),
        /requires rolldown@.+, but found rolldown@0\.0\.0/
    )
})
