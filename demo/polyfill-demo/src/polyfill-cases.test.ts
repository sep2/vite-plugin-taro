import assert from 'node:assert/strict'
import test from 'node:test'
import { polyfillCases } from './polyfill-cases.ts'
import { runPolyfillChecks } from './run-polyfill-checks.ts'

for (const { module, name, check } of polyfillCases) {
    test(`${module}: ${name}`, async () => {
        assert.equal(await check(), true)
    })
}

test('runner reports every configured check in order', async () => {
    const results = await runPolyfillChecks()
    assert.deepEqual(
        results.map(({ module }) => module),
        polyfillCases.map(({ module }) => module)
    )
    assert.equal(new Set(results.map(({ module }) => module)).size, results.length)
    assert.ok(results.every(({ passed, detail }) => passed && detail === 'OK'))
})
