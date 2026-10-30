import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import type { Rolldown } from 'vite'
import type { VptJsonObject } from '../../../options.ts'
import { createTestProject } from '../../tests/create-test-project.ts'
import { createH5TargetPlugins } from '../h5/plugins.ts'
import type { MiniContract } from '../mini/mini-contract.ts'
import { createTtMiniPlugins } from '../tt/plugins.ts'
import { createWxMiniPlugins } from '../wx/plugins.ts'
import { createAliCustomTabBarPlugin } from './create-ali-custom-tab-bar-plugin.ts'
import { createAliMiniContract } from './plugins.ts'

const fileNames = [
    'customize-tab-bar/index.acss',
    'customize-tab-bar/index.axml',
    'customize-tab-bar/index.js',
    'customize-tab-bar/index.json'
] as const

function createContract(appJson: VptJsonObject): MiniContract {
    return createAliMiniContract({
        target: 'zfb',
        app: 'src/app.tsx',
        pages: [],
        appJson,
        projectConfigJson: {}
    })
}

function generateFiles(
    appJson: VptJsonObject,
    bundle: Record<string, unknown>,
    publicDir: string
): Record<string, string> {
    const hook = createAliCustomTabBarPlugin(createContract(appJson)).generateBundle
    assert.ok(hook && typeof hook === 'object')
    // This generation-local journal records the assets emitted through the Vite hook.
    const files: Rolldown.EmittedFile[] = []
    Reflect.apply(
        hook.handler,
        {
            environment: { config: { publicDir } },
            emitFile(file: Rolldown.EmittedFile) {
                files.push(file)
                return String(files.length)
            }
        },
        [{}, bundle]
    )
    return Object.fromEntries(
        files.map((file) => {
            assert.ok(file.type === 'asset' && file.fileName && typeof file.source === 'string')
            return [file.fileName, file.source] as const
        })
    )
}

test('runs after project output in the client environment', () => {
    const plugin = createAliCustomTabBarPlugin(createContract({}))
    assert.equal(plugin.enforce, 'post')
    assert.ok(plugin.generateBundle && typeof plugin.generateBundle === 'object')
    assert.equal(plugin.generateBundle.order, 'post')
    assert.ok(typeof plugin.applyToEnvironment === 'function')
    assert.equal(Reflect.apply(plugin.applyToEnvironment, null, [{ name: 'client' }]), true)
    assert.equal(Reflect.apply(plugin.applyToEnvironment, null, [{ name: 'ssr' }]), false)
})

test('emits the shared native custom-tab placeholder', (context) => {
    const appJson = { tabBar: { customize: true, items: [{ pagePath: 'pages/home/index', name: 'Home' }] } }
    const original = structuredClone(appJson)
    const files = generateFiles(appJson, {}, '')
    assert.deepEqual(Object.keys(files).sort(), fileNames)
    assert.deepEqual(JSON.parse(files['customize-tab-bar/index.json']), { component: true })
    assert.equal(files['customize-tab-bar/index.axml'], '<view class="vpt-tab-bar-placeholder" />\n')
    assert.match(files['customize-tab-bar/index.acss'], /\.vpt-tab-bar-placeholder\s*\{\s*display: none;/)
    const component = context.mock.fn()
    runInNewContext(files['customize-tab-bar/index.js'], { Component: component })
    assert.equal(component.mock.calls.length, 1)
    assert.equal(JSON.stringify(component.mock.calls[0].arguments), '[{}]')
    assert.deepEqual(appJson, original)
})

test('selects only App configuration with customize set to the literal true', () => {
    const configs: readonly VptJsonObject[] = [
        {},
        { tabBar: null },
        { tabBar: false },
        { tabBar: 'custom' },
        { tabBar: [] },
        { tabBar: {} },
        { tabBar: { customize: false } },
        { tabBar: { customize: 'true' } },
        { tabBar: { customize: 1 } },
        { tabBar: { customize: null } }
    ]
    for (const config of configs) {
        assert.deepEqual(generateFiles(config, {}, ''), {})
    }
})

test('preserves native files already emitted by another plugin', () => {
    const source = 'Component({ data: { authored: true } })'
    const entry = { type: 'asset', source }
    const bundle = { 'customize-tab-bar/index.js': entry }
    const files = generateFiles({ tabBar: { customize: true } }, bundle, '')
    assert.deepEqual(
        Object.keys(files).sort(),
        fileNames.filter((name) => !name.endsWith('.js'))
    )
    assert.strictEqual(bundle['customize-tab-bar/index.js'], entry)
    assert.equal(entry.source, source)
})

test('preserves public native files and supplies their missing companions', async () => {
    const root = await createTestProject('ali-tab-bar-public-')
    const publicDir = path.join(root, 'public')
    const entry = path.join(publicDir, 'customize-tab-bar/index.js')
    const source = 'Component({ data: { authored: true } })'
    await mkdir(path.dirname(entry), { recursive: true })
    await writeFile(entry, source)
    const files = generateFiles({ tabBar: { customize: true } }, {}, publicDir)
    assert.deepEqual(
        Object.keys(files).sort(),
        fileNames.filter((name) => !name.endsWith('.js'))
    )
    assert.equal(await readFile(entry, 'utf8'), source)
})

for (const [target, createPlugins] of [
    ['wx', createWxMiniPlugins],
    ['tt', createTtMiniPlugins],
    ['h5', createH5TargetPlugins]
] as const) {
    test(`${target} registers its own target plugins`, () => {
        const plugins = createPlugins({
            target,
            app: 'src/app.tsx',
            pages: [],
            appJson: { tabBar: { customize: true } },
            projectConfigJson: {}
        })
        assert.equal(
            plugins
                .flat()
                .some(
                    (plugin) =>
                        plugin &&
                        typeof plugin === 'object' &&
                        'name' in plugin &&
                        plugin.name === 'vpt:ali-custom-tab-bar'
                ),
            false
        )
    })
}
