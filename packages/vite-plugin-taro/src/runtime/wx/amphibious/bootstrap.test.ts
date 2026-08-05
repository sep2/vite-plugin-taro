import assert from 'node:assert/strict'
import test from 'node:test'

// Bootstrap reads build-time placeholders during module initialization; provide inert values for this isolated runtime test.
Object.assign(globalThis, {
    __VITE_PLUGIN_TARO_APP_CONFIG__: {},
    __VITE_PLUGIN_TARO_TRANSPORT__: () => undefined
})

const bootstrap = import('./bootstrap.ts')

test('loads an eager native capsule synchronously', async () => {
    const config = { onLaunch() {} }
    const { loadCapsuleConfig } = await bootstrap

    assert.strictEqual(
        loadCapsuleConfig('App', () => ({ default: config })),
        config
    )
})

test('rejects an asynchronously transported eager capsule', async () => {
    const { loadCapsuleConfig } = await bootstrap

    assert.throws(
        () => loadCapsuleConfig('Page', () => Promise.resolve({ default: {} })),
        /Page capsule must load synchronously/
    )
})

test('rejects a capsule without a native configuration', async () => {
    const { loadCapsuleConfig } = await bootstrap

    assert.throws(
        () => loadCapsuleConfig('Component', () => ({ default: undefined })),
        /Expected a Component configuration/
    )
})
