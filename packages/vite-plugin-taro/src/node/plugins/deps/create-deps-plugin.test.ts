import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { createLogger, resolveConfig, rolldownVersion, version as viteVersion } from 'vite'
import { createDepsPlugin, warnDependencyVersions } from './create-deps-plugin.ts'

for (const command of ['serve', 'build'] as const) {
    test(`${command}: checks installed versions through Vite's configured logger without warnings`, async (context) => {
        const logger = createLogger('silent')
        const warn = context.mock.method(logger, 'warn')
        const plugin = createDepsPlugin()
        const config = await resolveConfig({ configFile: false, customLogger: logger, plugins: [plugin] }, command)

        assert.equal(plugin.name, 'vpt:deps')
        assert.strictEqual(config.logger, logger)
        assert.ok(config.plugins.includes(plugin))
        assert.equal(warn.mock.callCount(), 0)
    })
}

test('warns without throwing for a mismatched Vite version', () => {
    const warn = mock.fn<(message: string) => void>()
    assert.doesNotThrow(() => warnDependencyVersions('0.0.0', rolldownVersion, { warn }))
    assert.equal(warn.mock.callCount(), 1)
    assert.match(
        warn.mock.calls[0].arguments[0],
        /^\[vpt\] Tested with vite@.+, but found vite@0\.0\.0\. Compatibility is not guaranteed\.$/
    )
})

test('warns without throwing for a mismatched Rolldown version', () => {
    const warn = mock.fn<(message: string) => void>()
    assert.doesNotThrow(() => warnDependencyVersions(viteVersion, '0.0.0', { warn }))
    assert.equal(warn.mock.callCount(), 1)
    assert.match(
        warn.mock.calls[0].arguments[0],
        /^\[vpt\] Tested with rolldown@.+, but found rolldown@0\.0\.0\. Compatibility is not guaranteed\.$/
    )
})

test('reports both mismatched versions without blocking either warning', () => {
    const warn = mock.fn<(message: string) => void>()
    assert.doesNotThrow(() => warnDependencyVersions('0.0.0', '0.0.0', { warn }))
    assert.equal(warn.mock.callCount(), 2)
    assert.match(warn.mock.calls[0].arguments[0], /Tested with vite@.+, but found vite@0\.0\.0/)
    assert.match(warn.mock.calls[1].arguments[0], /Tested with rolldown@.+, but found rolldown@0\.0\.0/)
})
