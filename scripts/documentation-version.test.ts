import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveLatestStableVersion } from '../docs/src/lib/resolve-latest-stable-version.ts'

test('a successful stable release supplies its version without consulting npm', async (t) => {
    // The test-scoped mock owns and restores the only shared mutation, global fetch.
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ version: '0.7.0' }))
    assert.equal(await resolveLatestStableVersion('vite-plugin-taro', '0.7.1'), '0.7.1')
    assert.equal(fetch.mock.callCount(), 0)
})

test('ordinary and beta documentation deployments resolve the stable npm dist-tag', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ version: '0.7.0' }))
    assert.equal(await resolveLatestStableVersion('vite-plugin-taro', undefined), '0.7.0')
    assert.equal(await resolveLatestStableVersion('vite-plugin-taro', ''), '0.7.0')
    assert.equal(fetch.mock.calls[0].arguments[0], 'https://registry.npmjs.org/vite-plugin-taro/latest')
})

test('documentation accepts a version, not a prerelease or either Git tag format', async () => {
    for (const version of ['0.7.1-beta.2', 'v0.7.1', 'vite-plugin-taro@0.7.1']) {
        await assert.rejects(resolveLatestStableVersion('vite-plugin-taro', version), /Expected a stable version/)
    }
})

test('a prerelease on latest is not displayed as the stable documentation version', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ version: '0.7.1-beta.2' }))
    await assert.rejects(resolveLatestStableVersion('vite-plugin-taro', undefined), /must resolve to a stable version/)
})
