import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test, { mock } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'rolldown'
import { createLogger, resolveConfig, rolldownVersion, version as viteVersion } from 'vite'
import { packageRequire } from '../../utils/packages.ts'
import { createDepsPlugin, warnDependencyVersions } from './create-deps-plugin.ts'

const dependencyNames = ['vite', 'rolldown', 'vite-plugin-taro-runtime'] as const
const pluginVersion = (packageRequire('vite-plugin-taro/package.json') as Readonly<{ version: string }>).version
const installedVersions = {
    vite: viteVersion,
    rolldown: rolldownVersion,
    'vite-plugin-taro-runtime': pluginVersion
}

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

/** Exercise real package resolution without mutating either workspace manifest. */
test('warns for an installed runtime that does not export its package.json', async (context) => {
    const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
    const root = await mkdtemp(path.join(packageRoot, '.vpt-deps-test-'))
    context.after(() => rm(root, { recursive: true, force: true }))
    const pluginRoot = path.join(root, 'node_modules/vite-plugin-taro')
    const runtimeRoot = path.join(root, 'node_modules/vite-plugin-taro-runtime')
    await Promise.all([mkdir(pluginRoot, { recursive: true }), mkdir(runtimeRoot, { recursive: true })])
    await Promise.all([
        writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'deps-test', type: 'module' })),
        writeFile(
            path.join(pluginRoot, 'package.json'),
            JSON.stringify({
                name: 'vite-plugin-taro',
                version: pluginVersion,
                exports: { './package.json': './package.json' },
                dependencies: { rolldown: rolldownVersion },
                peerDependencies: { vite: viteVersion }
            })
        ),
        writeFile(
            path.join(runtimeRoot, 'package.json'),
            JSON.stringify({
                name: 'vite-plugin-taro-runtime',
                version: '0.0.0',
                exports: { './runtime/mini': './dist/runtime/index.js' }
            })
        )
    ])

    const result = await build({
        input: fileURLToPath(new URL('./create-deps-plugin.ts', import.meta.url)),
        external: ['vite', /^node:/],
        output: { format: 'es' },
        write: false
    })
    const chunk = result.output[0]
    assert.ok(chunk.type === 'chunk')
    const emittedPath = path.join(root, 'deps.js')
    await writeFile(emittedPath, chunk.code)
    const emitted: { createDepsPlugin: typeof createDepsPlugin } = await import(pathToFileURL(emittedPath).href)
    const logger = createLogger('silent')
    const warn = context.mock.method(logger, 'warn')
    await resolveConfig(
        { root, configFile: false, customLogger: logger, plugins: [emitted.createDepsPlugin()] },
        'build'
    )

    assert.equal(warn.mock.callCount(), 1)
    assert.equal(
        warn.mock.calls[0].arguments[0],
        `[vpt] Tested with vite-plugin-taro-runtime@${pluginVersion}, but found vite-plugin-taro-runtime@0.0.0. Compatibility is not guaranteed.`
    )
})

for (const dependency of dependencyNames) {
    test(`warns without throwing for a mismatched ${dependency} version`, () => {
        const warn = mock.fn<(message: string) => void>()
        assert.doesNotThrow(() => warnDependencyVersions({ ...installedVersions, [dependency]: '0.0.0' }, { warn }))
        assert.equal(warn.mock.callCount(), 1)
        assert.equal(
            warn.mock.calls[0].arguments[0],
            `[vpt] Tested with ${dependency}@${installedVersions[dependency]}, but found ${dependency}@0.0.0. Compatibility is not guaranteed.`
        )
    })
}

test('warns when the installed runtime is newer than the plugin', () => {
    const warn = mock.fn<(message: string) => void>()
    assert.doesNotThrow(() =>
        warnDependencyVersions({ ...installedVersions, 'vite-plugin-taro-runtime': '999.0.0' }, { warn })
    )
    assert.equal(warn.mock.callCount(), 1)
    assert.match(warn.mock.calls[0].arguments[0], /but found vite-plugin-taro-runtime@999\.0\.0/)
})

test('reports all mismatched dependency versions without blocking any warning', () => {
    const warn = mock.fn<(message: string) => void>()
    assert.doesNotThrow(() =>
        warnDependencyVersions({ vite: '0.0.0', rolldown: '0.0.0', 'vite-plugin-taro-runtime': '0.0.0' }, { warn })
    )
    assert.equal(warn.mock.callCount(), 3)
    assert.deepEqual(
        warn.mock.calls.map(({ arguments: [message] }) => message),
        dependencyNames.map(
            (dependency) =>
                `[vpt] Tested with ${dependency}@${installedVersions[dependency]}, but found ${dependency}@0.0.0. Compatibility is not guaranteed.`
        )
    )
})
