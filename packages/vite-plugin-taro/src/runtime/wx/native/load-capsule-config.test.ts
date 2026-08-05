import assert from 'node:assert/strict'
import test from 'node:test'
import { loadCapsuleConfig } from './load-capsule-config.ts'

test('loads an eager native capsule synchronously', () => {
    const config = { onLaunch() {} }

    assert.strictEqual(
        loadCapsuleConfig('App', () => ({ default: config })),
        config
    )
})

test('rejects an asynchronously transported eager capsule', () => {
    assert.throws(
        () => loadCapsuleConfig('Page', () => Promise.resolve({ default: {} })),
        /Page capsule must load synchronously/
    )
})

test('rejects a capsule without a native configuration', () => {
    assert.throws(
        () => loadCapsuleConfig('Component', () => ({ default: undefined })),
        /Expected a Component configuration/
    )
})
