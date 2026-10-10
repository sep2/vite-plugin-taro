import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import type { InlineConfig, ResolvedConfig } from 'vite'
import { build, createServer, resolveConfig } from 'vite'
import type { VptJsonObject, VptOptions } from '../../../../options.ts'
import { createTestProject } from '../../../tests/create-test-project.ts'
import { projectTempDir } from '../../../tests/project-temp-dir.ts'
import { publishSourceGeneration } from '../../../tests/publish-source-generation.ts'
import vpt from '../../../vpt.ts'
import { createTtMiniContract } from '../../tt/plugins.ts'
import { createWxMiniContract } from '../../wx/plugins.ts'
import { createZfbMiniContract } from '../../zfb/plugins.ts'
import type { MiniContract } from '../mini-contract.ts'
import { createMiniWatchPlugin } from '../watch/create-mini-watch-plugin.ts'
import { createMiniOverridePlugin } from './create-mini-override-plugin.ts'

const miniContracts = {
    wx: createWxMiniContract,
    zfb: createZfbMiniContract,
    tt: createTtMiniContract
} as const

for (const command of ['build', 'serve'] as const) {
    test(`selects ordered overrides with resolved environment config during ${command}`, async () => {
        // This test-local journal records the exact environment config supplied to each output generation.
        const selections: ResolvedConfig[] = []
        const content = Object.freeze({
            setting: Object.freeze({ enabled: false, values: Object.freeze(['first']) })
        })
        const contract = {
            override: [
                {
                    apply(config) {
                        selections.push(config)
                        return config.build.write === false && config.command === command && config.mode === 'custom'
                    },
                    name: 'nested/config.json',
                    content
                },
                {
                    apply: (config) => config.mode !== 'custom',
                    name: 'nested/config.json',
                    content: { ignored: true }
                },
                {
                    apply: () => true,
                    name: 'nested/config.json',
                    content: { setting: { enabled: true, added: 'second' } }
                },
                { apply: () => true, name: 'absent.json', content: { ignored: true } },
                { apply: () => true, name: 'app.js', content: { ignored: true } }
            ]
        } satisfies Pick<MiniContract, 'override'>
        const config = await resolveConfig(
            {
                configFile: false,
                mode: 'custom',
                build: { write: false },
                plugins: [createMiniOverridePlugin(contract)]
            },
            command
        )
        const plugin = config.plugins.find(({ name }) => name === 'vpt:mini-override')
        assert.ok(plugin)
        assert.equal(selections.length, 0)
        assert.equal(plugin.enforce, 'post')
        assert.ok(typeof plugin.applyToEnvironment === 'function')
        assert.equal(Reflect.apply(plugin.applyToEnvironment, null, [{ name: 'client' }]), true)
        assert.equal(Reflect.apply(plugin.applyToEnvironment, null, [{ name: 'ssr' }]), false)
        const hook = plugin.generateBundle
        assert.ok(hook && typeof hook === 'object')
        assert.equal(hook.order, 'post')

        const source = '{"setting":{"enabled":null,"retained":true,"values":["original"]}}'
        const expected = { setting: { enabled: true, retained: true, values: ['original', 'first'], added: 'second' } }
        for (const isProduction of [false, true]) {
            for (const assetSource of [source, new TextEncoder().encode(source)]) {
                // The hook owns this generation's output; metadata and unrelated entries must retain their identity.
                const asset = {
                    type: 'asset',
                    fileName: 'nested/config.json',
                    names: ['config'],
                    source: assetSource
                }
                const chunk = { type: 'chunk', fileName: 'app.js', code: 'export {}' }
                const untouched = { type: 'asset', fileName: 'untouched.txt', source: 'not JSON' }
                const bundle = { 'nested/config.json': asset, 'app.js': chunk, 'untouched.txt': untouched }
                const environmentConfig = { ...config, isProduction }
                Reflect.apply(hook.handler, { environment: { config: environmentConfig } }, [{}, bundle])
                assert.equal(selections.at(-1), environmentConfig)
                assert.equal(
                    asset.source,
                    isProduction ? JSON.stringify(expected) : `${JSON.stringify(expected, null, 4)}\n`
                )
                assert.deepEqual(asset.names, ['config'])
                assert.deepEqual(Object.keys(bundle), ['nested/config.json', 'app.js', 'untouched.txt'])
                assert.equal(bundle['app.js'], chunk)
                assert.equal(chunk.code, 'export {}')
                assert.equal(bundle['untouched.txt'], untouched)
                assert.equal(untouched.source, 'not JSON')
            }
        }
        assert.equal(selections.length, 4)
        for (const config of selections) {
            assert.equal(config.build.write, false)
            assert.equal(config.command, command)
            assert.equal(config.mode, 'custom')
        }
        assert.deepEqual(content, { setting: { enabled: false, values: ['first'] } })
    })
}

test('preserves output when the contract has no rules', async () => {
    const config = await resolveConfig(
        { configFile: false, plugins: [createMiniOverridePlugin({ override: [] })] },
        'build'
    )
    const hook = config.plugins.find(({ name }) => name === 'vpt:mini-override')?.generateBundle
    assert.ok(hook && typeof hook === 'object')
    // An empty contract must leave arbitrary output bytes untouched.
    const bundle = { 'untouched.txt': { type: 'asset', source: 'not JSON' } }
    Reflect.apply(hook.handler, { environment: { config } }, [{}, bundle])
    assert.deepEqual(bundle, { 'untouched.txt': { type: 'asset', source: 'not JSON' } })
})

for (const target of ['wx', 'zfb', 'tt'] as const) {
    for (const renderer of [undefined, 'template', 'dom'] as const) {
        test(`${target}: composes renderer=${renderer} project overrides across build and serve`, async () => {
            const contract = miniContracts[target]({
                target,
                renderer,
                app: 'app.js',
                pages: [],
                appJson: {},
                projectConfigJson: {}
            })
            const { projectConfigFilename } = contract.output
            const sourceFiles = createProjectConfigFixture(target, true)
            const cases = [
                { command: 'build', build: { watch: {} }, physicalWatch: true },
                { command: 'serve', build: { watch: {} }, physicalWatch: false },
                { command: 'build', build: undefined, physicalWatch: false },
                { command: 'build', build: { watch: null }, physicalWatch: false },
                { command: 'build', build: { watch: {}, write: false }, physicalWatch: false },
                { command: 'build', build: { watch: { skipWrite: true } }, physicalWatch: false }
            ] as const
            for (const mode of ['development', 'production']) {
                for (const { command, build, physicalWatch } of cases) {
                    const config = await resolveConfig(
                        { configFile: false, mode, build, plugins: [createMiniOverridePlugin(contract)] },
                        command
                    )
                    const hook = config.plugins.find(({ name }) => name === 'vpt:mini-override')?.generateBundle
                    assert.ok(hook && typeof hook === 'object')
                    const nativeFiles = createProjectConfigFixture(target, !physicalWatch)
                    for (const enableTTDom of [undefined, false, true]) {
                        const domSetting = enableTTDom === undefined ? {} : { enableTTDom }
                        const inputFiles = {
                            ...sourceFiles,
                            [projectConfigFilename]: { ...sourceFiles[projectConfigFilename], ...domSetting }
                        }
                        const expectedFiles: Readonly<Record<string, VptJsonObject>> = {
                            ...nativeFiles,
                            [projectConfigFilename]: {
                                ...nativeFiles[projectConfigFilename],
                                ...domSetting,
                                ...(target === 'tt' && renderer === 'dom' ? { enableTTDom: true } : {})
                            }
                        }
                        // One asset per filename lets independent renderer and watch rules compose on the same JSON.
                        const bundle = Object.fromEntries(
                            Object.entries(inputFiles).map(([fileName, content]) => [
                                fileName,
                                { type: 'asset', fileName, source: JSON.stringify(content) }
                            ])
                        )
                        Reflect.apply(hook.handler, { environment: { config } }, [{}, bundle])
                        assert.deepEqual(Object.keys(bundle), Object.keys(inputFiles))
                        for (const [fileName, expected] of Object.entries(expectedFiles)) {
                            assert.deepEqual(JSON.parse(bundle[fileName].source), expected, fileName)
                        }
                    }
                }
            }
        })
    }
}

for (const target of ['wx', 'zfb', 'tt', 'h5'] as const) {
    for (const hotReload of [true, false, undefined]) {
        test(`${target}: overrides handle hotReload=${hotReload} without changing unrelated configuration`, async (context) => {
            const root = await fs.mkdtemp(path.join(projectTempDir, 'vpt-mini-watch-project-'))
            context.after(() => fs.rm(root, { recursive: true, force: true }))
            const input = path.join(root, 'app.js')
            await fs.writeFile(input, 'console.log("fixture");\n')
            // Include every platform's spelling so the assertions also catch writes to foreign fields and files.
            const setting = hotReload === undefined ? undefined : { compileHotReLoad: hotReload, autoCompile: true }
            const developOptions = hotReload === undefined ? undefined : { hotReload, skipTranspile: true }
            const preferences = {
                setting: Object.freeze(setting),
                developOptions: Object.freeze(developOptions),
                compileHotReload: hotReload
            }
            const projectConfig = Object.freeze({ appid: 'fixture', ...preferences })
            const privateConfig = Object.freeze({ projectname: 'private', ...preferences })
            const projectFile = target === 'zfb' ? 'mini.project.json' : 'project.config.json'
            const privateFile = target === 'zfb' ? '.mini-ide/project-ide.json' : 'project.private.config.json'
            const outDir = path.join(root, 'dist')
            await fs.mkdir(path.dirname(path.join(outDir, privateFile)), { recursive: true })
            await fs.writeFile(path.join(outDir, projectFile), 'previous project config')
            await fs.writeFile(path.join(outDir, privateFile), 'previous private config')
            await fs.writeFile(path.join(outDir, 'obsolete.js'), 'obsolete output')
            const sourceFiles = {
                [projectFile]: JSON.stringify(projectConfig),
                [privateFile]: JSON.stringify(privateConfig),
                'app.json': '{"pages":[]}'
            }
            const expectedProject = {
                wx: { ...projectConfig, setting: { ...setting, compileHotReLoad: false } },
                zfb: { ...projectConfig, developOptions: { ...developOptions, hotReload: false } },
                tt: { ...projectConfig, compileHotReload: false, setting: { ...setting, compileHotReLoad: false } },
                h5: projectConfig
            }[target]
            const expectedPrivate =
                target === 'wx' || target === 'tt'
                    ? { ...privateConfig, setting: { ...setting, compileHotReLoad: false } }
                    : privateConfig
            const expectedFiles: Readonly<Record<string, VptJsonObject>> = {
                [projectFile]: expectedProject,
                [privateFile]: expectedPrivate,
                'app.json': { pages: [] }
            }
            const completed = Promise.withResolvers<void>()
            const config = {
                root,
                configFile: false,
                logLevel: 'silent',
                plugins: [
                    {
                        name: 'test:project-skeleton',
                        generateBundle: {
                            // The real skeleton uses a post hook too; the overrides must run after its emission.
                            order: 'post',
                            async handler() {
                                if (this.environment.config.build.watch) {
                                    // The previous project files stay present until this generation replaces them on disk.
                                    assert.equal(
                                        await fs.readFile(path.join(outDir, projectFile), 'utf8'),
                                        'previous project config'
                                    )
                                    assert.equal(
                                        await fs.readFile(path.join(outDir, privateFile), 'utf8'),
                                        'previous private config'
                                    )
                                    await assert.rejects(fs.access(path.join(outDir, 'obsolete.js')), {
                                        code: 'ENOENT'
                                    })
                                }
                                for (const [fileName, source] of Object.entries(sourceFiles)) {
                                    this.emitFile({ type: 'asset', fileName, source })
                                }
                            }
                        }
                    },
                    createMiniWatchPlugin({
                        output: { projectConfigFilename: projectFile, projectPrivateConfigFilename: privateFile }
                    }),
                    createMiniOverridePlugin({
                        override:
                            target === 'h5'
                                ? []
                                : miniContracts[target]({
                                      target,
                                      app: 'app.js',
                                      pages: [],
                                      appJson: {},
                                      projectConfigJson: {}
                                  }).override
                    }),
                    {
                        name: 'test:watch-completed',
                        enforce: 'post',
                        closeBundle: {
                            order: 'post',
                            sequential: true,
                            handler(error) {
                                if (!error) {
                                    completed.resolve()
                                }
                            }
                        }
                    }
                ],
                build: { watch: {}, rolldownOptions: { input } }
            } satisfies InlineConfig
            const watcher = await build(config)
            assert.ok(!Array.isArray(watcher) && 'on' in watcher)
            context.after(() => watcher.close())
            watcher.on('event', (event) => {
                if (event.code === 'ERROR') {
                    completed.reject(event.error)
                }
            })
            await completed.promise
            for (const [fileName, expected] of Object.entries(expectedFiles)) {
                assert.deepEqual(
                    JSON.parse(await fs.readFile(path.join(root, 'dist', fileName), 'utf8')),
                    JSON.parse(JSON.stringify(expected))
                )
            }
            assert.equal(JSON.stringify(projectConfig), sourceFiles[projectFile])
            assert.equal(JSON.stringify(privateConfig), sourceFiles[privateFile])
            await watcher.close()
            await build({ ...config, build: { ...config.build, watch: null } })
            for (const [fileName, source] of Object.entries(sourceFiles)) {
                assert.equal(await fs.readFile(path.join(root, 'dist', fileName), 'utf8'), source)
            }
        })
    }
}

for (const target of ['wx', 'zfb', 'tt'] as const) {
    test(`${target}: public plugin disables hot reload on every watch build and restores configured settings in dev`, {
        timeout: 30_000
    }, async (context) => {
        const root = await createTestProject('watch-')
        context.after(() => fs.rm(root, { recursive: true, force: true }))
        const input = path.join(root, 'app.tsx')
        await fs.writeFile(input, 'export default function App() { return null }\n')
        const originalFiles = createProjectConfigFixture(target, true)
        const options: VptOptions = {
            target,
            app: input,
            pages: [],
            appJson: {},
            projectConfigJson: originalFiles[target === 'zfb' ? 'mini.project.json' : 'project.config.json'],
            projectPrivateConfigJson:
                originalFiles[target === 'zfb' ? '.mini-ide/project-ide.json' : 'project.private.config.json'],
            hmr: { mode: target === 'wx' ? 'devtools' : 'interpreter' }
        }
        // Advance the completion promise only after observing each fully written generation.
        let completed = Promise.withResolvers<void>()
        const config = {
            root,
            configFile: false,
            logLevel: 'silent',
            plugins: [
                vpt(options),
                {
                    name: 'test:watch-completed',
                    enforce: 'post',
                    closeBundle: {
                        order: 'post',
                        sequential: true,
                        handler(error) {
                            if (!error) {
                                completed.resolve()
                            }
                        }
                    }
                }
            ],
            build: { watch: {} }
        } satisfies InlineConfig
        const watcher = await build(config)
        assert.ok(!Array.isArray(watcher) && 'on' in watcher)
        context.after(() => watcher.close())
        watcher.on('event', (event) => {
            if (event.code === 'ERROR') {
                completed.reject(event.error)
            }
        })
        const expectedFiles = createProjectConfigFixture(target, false)
        for (const generation of [0, 1]) {
            if (generation === 1) {
                completed = Promise.withResolvers<void>()
                await publishSourceGeneration(input, 'export default function App() { return "updated" }\n')
            }
            await completed.promise
            for (const [fileName, expected] of Object.entries(expectedFiles)) {
                assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'dist', fileName), 'utf8')), expected)
            }
        }
        await watcher.close()
        const server = await createServer({
            root,
            configFile: false,
            logLevel: 'silent',
            plugins: vpt(options),
            server: { port: 0, watch: null, ws: false }
        })
        context.after(() => server.close())
        await server.listen()
        for (const [fileName, expected] of Object.entries(originalFiles)) {
            assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'dist', fileName), 'utf8')), expected)
        }
    })
}

/** Native schemas stay separate so the public integration test catches field spelling and file ownership mistakes. */
function createProjectConfigFixture(
    target: 'wx' | 'zfb' | 'tt',
    hotReload: boolean
): Readonly<Record<string, VptJsonObject>> {
    switch (target) {
        case 'wx':
            return {
                'project.config.json': Object.freeze({
                    appid: 'fixture',
                    setting: Object.freeze({ compileHotReLoad: hotReload, urlCheck: false })
                }),
                'project.private.config.json': Object.freeze({
                    setting: Object.freeze({ compileHotReLoad: hotReload, skylineRenderEnable: false })
                })
            }
        case 'zfb':
            return {
                'mini.project.json': Object.freeze({
                    appid: 'fixture',
                    format: 2,
                    compileOptions: { globalObjectMode: 'enable', transpile: {} },
                    developOptions: Object.freeze({ hotReload, skipTranspile: true, sourcemap: false })
                }),
                '.mini-ide/project-ide.json': Object.freeze({ ignoreHttpDomainCheck: true })
            }
        case 'tt':
            return {
                'project.config.json': Object.freeze({
                    appid: 'fixture',
                    compileHotReload: hotReload,
                    setting: Object.freeze({ compileHotReLoad: hotReload, autoCompile: true, urlCheck: false })
                }),
                'project.private.config.json': Object.freeze({
                    setting: Object.freeze({ compileHotReLoad: hotReload, autoCompile: true, urlCheck: false })
                })
            }
    }
}
