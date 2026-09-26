import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { InlineConfig, Plugin } from 'vite'
import { build, createServer, resolveConfig } from 'vite'
import type { VptJsonObject, VptOptions } from '../../../../options.ts'
import { packageRequire } from '../../../utils/packages.ts'
import vpt from '../../../vpt.ts'
import { createMiniWatchPlugin } from './create-mini-watch-plugin.ts'

const markerPattern = /^\/\/ [\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\n$/
const wxWatchContract = {
    options: { target: 'wx' },
    output: {
        projectConfigFilename: 'project.config.json',
        projectPrivateConfigFilename: 'project.private.config.json'
    }
} as const

test('enables the filesystem policy only for physical watch builds, including production mode', async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-mini-watch-config-'))
    context.after(() => fs.rm(root, { recursive: true, force: true }))
    const options = {
        root,
        configFile: false,
        mode: 'production',
        plugins: [createMiniWatchPlugin(wxWatchContract)]
    } satisfies InlineConfig
    const watched = await resolveConfig({ ...options, build: { watch: {}, emptyOutDir: true } }, 'build')
    assert.equal(watched.build.emptyOutDir, false)
    assert.ok(watched.plugins.some(({ name }) => name === 'vpt:mini-watch'))
    const excluded = [
        { command: 'serve', build: { watch: {} } },
        { command: 'build', build: {} },
        { command: 'build', build: { watch: {}, write: false } },
        { command: 'build', build: { watch: { skipWrite: true } } }
    ] as const
    for (const { command, build } of excluded) {
        const config = await resolveConfig({ ...options, build: { ...build, emptyOutDir: true } }, command)
        assert.equal(config.build.emptyOutDir, true)
        assert.ok(!config.plugins.some(({ name }) => name === 'vpt:mini-watch'))
    }
})

for (const target of ['wx', 'zfb', 'tt', 'h5'] as const) {
    for (const hotReload of [true, false, undefined]) {
        test(`${target}: watch handles hotReload=${hotReload} without changing unrelated configuration`, async (context) => {
            const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-mini-watch-project-'))
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
                            // The real skeleton uses a post hook too; the watch policy must run after its emission.
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
                        options: { target },
                        output: { projectConfigFilename: projectFile, projectPrivateConfigFilename: privateFile }
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
        const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
        const root = await fs.mkdtemp(path.join(packageRoot, '.vpt-watch-test-'))
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
                await fs.writeFile(input, 'export default function App() { return "updated" }\n')
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

test('closing a failed watcher never publishes a successful completion marker', async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-mini-watch-error-'))
    context.after(() => fs.rm(root, { recursive: true, force: true }))
    const failed = Promise.withResolvers<void>()
    const watcher = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [createMiniWatchPlugin(wxWatchContract)],
        build: { watch: {}, rolldownOptions: { input: path.join(root, 'missing.js') } }
    })
    assert.ok(!Array.isArray(watcher) && 'on' in watcher)
    context.after(() => watcher.close())
    watcher.on('event', (event) => {
        if (event.code === 'ERROR') {
            failed.resolve()
        }
    })
    await failed.promise
    await watcher.close()
    const { closeBundle } = createMiniWatchPlugin(wxWatchContract)
    assert.ok(closeBundle && typeof closeBundle === 'object')
    assert.equal(Reflect.apply(closeBundle.handler, null, [new Error('failed close')]), undefined)
    await assert.rejects(fs.access(path.join(root, 'dist/hmr/watch.js')), { code: 'ENOENT' })
})

test('watch cleans only at startup, preserves live output and signals only after successful writes', {
    timeout: 30_000
}, async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-mini-watch-'))
    const outDir = path.join(root, 'dist')
    const appFile = path.join(outDir, 'app.js')
    const markerFile = path.join(outDir, 'hmr/watch.js')
    const sourceFile = path.join(root, 'app.js')
    const lazyFile = path.join(root, 'lazy.js')
    const appSource = 'export const load = () => import("./lazy.js");\n'
    await fs.writeFile(sourceFile, appSource)
    await fs.writeFile(lazyFile, 'export const value = "one";\n')
    await fs.mkdir(path.join(outDir, 'obsolete/nested'), { recursive: true })
    await fs.writeFile(path.join(outDir, 'obsolete/nested/old.js'), 'obsolete')
    const directoryInode = (await fs.stat(path.join(outDir, 'obsolete/nested'))).ino
    const firstWritten = Promise.withResolvers<void>()
    const releaseFirstWrite = Promise.withResolvers<void>()
    // These case-local handles advance one controlled watch build at a time, including failed writes and restarts.
    let completed = Promise.withResolvers<void>()
    let failed = Promise.withResolvers<void>()
    let firstWrite = true
    let rejectWrite = false
    let writtenApp = ''
    let publishedMarker: string | undefined
    const fixture: Plugin = {
        name: 'test:watch-output',
        enforce: 'post',
        generateBundle() {
            this.emitFile({ type: 'asset', fileName: 'app.json', source: '{"pages":[]}' })
            this.emitFile({ type: 'asset', fileName: 'native/component.wxml', source: '<view />' })
        },
        writeBundle: {
            order: 'post',
            sequential: true,
            async handler(_options, bundle) {
                assert.equal(bundle['app.js'].type, 'chunk', 'App must remain in ordinary Rolldown output')
                writtenApp = await fs.readFile(appFile, 'utf8')
                if (publishedMarker === undefined) {
                    await assert.rejects(fs.access(markerFile), { code: 'ENOENT' })
                } else {
                    assert.equal(await fs.readFile(markerFile, 'utf8'), publishedMarker)
                }
                assert.equal(await fs.readFile(path.join(outDir, 'native/component.wxml'), 'utf8'), '<view />')
                if (firstWrite) {
                    firstWrite = false
                    firstWritten.resolve()
                    await releaseFirstWrite.promise
                }
                if (rejectWrite) {
                    throw new Error('test: write rejected')
                }
            }
        },
        closeBundle: {
            order: 'post',
            sequential: true,
            async handler(error) {
                if (!error) {
                    const marker = await fs.readFile(markerFile, 'utf8')
                    assert.match(marker, markerPattern)
                    assert.notEqual(marker, publishedMarker)
                    publishedMarker = marker
                    assert.equal(await fs.readFile(appFile, 'utf8'), writtenApp, 'Completion must not rewrite App')
                    completed.resolve()
                }
            }
        }
    }
    const config = {
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [createMiniWatchPlugin(wxWatchContract), fixture],
        build: {
            outDir,
            watch: {},
            minify: false,
            rolldownOptions: {
                input: { app: sourceFile },
                preserveEntrySignatures: 'allow-extension',
                output: { entryFileNames: '[name].js', chunkFileNames: 'assets/[name].js' }
            }
        }
    } satisfies InlineConfig
    const start = async () => {
        publishedMarker = undefined
        const watcher = await build(config)
        assert.ok(!Array.isArray(watcher) && 'on' in watcher)
        watcher.on('event', (event) => {
            if (event.code === 'ERROR') {
                failed.resolve()
            }
        })
        return watcher
    }
    let watcher = await start()
    context.after(async () => {
        releaseFirstWrite.resolve()
        await watcher.close()
        await fs.rm(root, { recursive: true, force: true })
    })
    await firstWritten.promise
    await assert.rejects(fs.access(markerFile), { code: 'ENOENT' })
    releaseFirstWrite.resolve()
    await completed.promise
    const initialMarker = await fs.readFile(markerFile, 'utf8')
    const initialChunk = (await fs.readdir(path.join(outDir, 'assets')))[0]
    assert.equal(initialChunk, 'lazy.js')
    await assert.rejects(fs.access(path.join(outDir, 'obsolete/nested/old.js')), { code: 'ENOENT' })

    completed = Promise.withResolvers<void>()
    await fs.writeFile(lazyFile, 'export const value = "two";\n')
    await completed.promise
    assert.notEqual(await fs.readFile(markerFile, 'utf8'), initialMarker)
    assert.match(await fs.readFile(path.join(outDir, 'assets', initialChunk), 'utf8'), /two/)
    assert.equal((await fs.stat(path.join(outDir, 'obsolete/nested'))).ino, directoryInode)

    completed = Promise.withResolvers<void>()
    await fs.writeFile(path.join(root, 'extra.js'), 'export const extra = true;\n')
    await fs.writeFile(sourceFile, `${appSource}export const more = () => import("./extra.js");\n`)
    await completed.promise
    await fs.access(path.join(outDir, 'assets/extra.js'))
    completed = Promise.withResolvers<void>()
    await fs.writeFile(sourceFile, appSource)
    await completed.promise
    await fs.access(path.join(outDir, 'assets/extra.js'))
    const lastGoodApp = await fs.readFile(appFile, 'utf8')
    const lastGoodMarker = await fs.readFile(markerFile, 'utf8')

    failed = Promise.withResolvers<void>()
    await fs.writeFile(lazyFile, 'export const value = ;\n')
    await failed.promise
    assert.equal(await fs.readFile(markerFile, 'utf8'), lastGoodMarker)
    assert.equal(await fs.readFile(appFile, 'utf8'), lastGoodApp)

    rejectWrite = true
    failed = Promise.withResolvers<void>()
    await fs.writeFile(lazyFile, 'export const value = "write-failure";\n')
    await failed.promise
    assert.equal(await fs.readFile(markerFile, 'utf8'), lastGoodMarker)

    rejectWrite = false
    completed = Promise.withResolvers<void>()
    await fs.writeFile(lazyFile, 'export const value = "recovered";\n')
    await completed.promise
    const recoveredMarker = await fs.readFile(markerFile, 'utf8')
    await watcher.close()
    assert.equal(await fs.readFile(markerFile, 'utf8'), recoveredMarker)
    completed = Promise.withResolvers<void>()
    watcher = await start()
    await completed.promise
    assert.notEqual(await fs.readFile(markerFile, 'utf8'), recoveredMarker, 'No-edit restarts need fresh bytes')
    await assert.rejects(fs.access(path.join(outDir, 'assets/extra.js')), { code: 'ENOENT' })
    assert.equal((await fs.stat(path.join(outDir, 'obsolete/nested'))).ino, directoryInode)
    assert.equal(await fs.readFile(sourceFile, 'utf8'), appSource)
})
