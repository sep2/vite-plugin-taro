import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { InlineConfig, Plugin } from 'vite'
import { build, resolveConfig } from 'vite'
import { createWxWatchPlugin } from './create-wx-watch-plugin.ts'

const markerPattern = /^\/\/ [\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\n$/

test('enables the filesystem policy only for physical watch builds, including production mode', async () => {
    const options = { configFile: false, mode: 'production', plugins: [createWxWatchPlugin()] } satisfies InlineConfig
    const watched = await resolveConfig({ ...options, build: { watch: {}, emptyOutDir: true } }, 'build')
    assert.equal(watched.build.emptyOutDir, false)
    assert.ok(watched.plugins.some(({ name }) => name === 'vpt:wx-watch'))
    const excluded = [
        { command: 'serve', build: { watch: {} } },
        { command: 'build', build: {} },
        { command: 'build', build: { watch: {}, write: false } },
        { command: 'build', build: { watch: { skipWrite: true } } }
    ] as const
    for (const { command, build } of excluded) {
        const config = await resolveConfig({ ...options, build: { ...build, emptyOutDir: true } }, command)
        assert.equal(config.build.emptyOutDir, true)
        assert.ok(!config.plugins.some(({ name }) => name === 'vpt:wx-watch'))
    }
})

test('closing a failed watcher never publishes a successful completion marker', async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-wx-watch-error-'))
    context.after(() => fs.rm(root, { recursive: true, force: true }))
    const failed = Promise.withResolvers<void>()
    const watcher = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [createWxWatchPlugin()],
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
    const { closeBundle } = createWxWatchPlugin()
    assert.ok(closeBundle && typeof closeBundle === 'object')
    assert.equal(Reflect.apply(closeBundle.handler, null, [new Error('failed close')]), undefined)
    await assert.rejects(fs.access(path.join(root, 'dist/hmr/watch.js')), { code: 'ENOENT' })
})

test('watch retains directories and hashes, cleans all files and signals only after completed writes', {
    timeout: 30_000
}, async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-wx-watch-'))
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
                await assert.rejects(fs.access(markerFile), { code: 'ENOENT' })
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
                    assert.match(await fs.readFile(markerFile, 'utf8'), markerPattern)
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
        plugins: [createWxWatchPlugin(), fixture],
        build: {
            outDir,
            watch: {},
            minify: false,
            rolldownOptions: {
                input: { app: sourceFile },
                preserveEntrySignatures: 'allow-extension',
                output: { entryFileNames: '[name].js', chunkFileNames: 'assets/[name]-[hash].js' }
            }
        }
    } satisfies InlineConfig
    const start = async () => {
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
    assert.match(initialChunk, /^lazy-[\w-]+\.js$/)
    await assert.rejects(fs.access(path.join(outDir, 'obsolete/nested/old.js')), { code: 'ENOENT' })

    completed = Promise.withResolvers<void>()
    await fs.writeFile(lazyFile, 'export const value = "two";\n')
    await completed.promise
    assert.notEqual(await fs.readFile(markerFile, 'utf8'), initialMarker)
    await assert.rejects(fs.access(path.join(outDir, 'assets', initialChunk)), { code: 'ENOENT' })
    assert.equal((await fs.stat(path.join(outDir, 'obsolete/nested'))).ino, directoryInode)

    completed = Promise.withResolvers<void>()
    await fs.writeFile(path.join(root, 'extra.js'), 'export const extra = true;\n')
    await fs.writeFile(sourceFile, `${appSource}export const more = () => import("./extra.js");\n`)
    await completed.promise
    assert.ok((await fs.readdir(path.join(outDir, 'assets'))).some((name) => /^extra-[\w-]+\.js$/.test(name)))
    completed = Promise.withResolvers<void>()
    await fs.writeFile(sourceFile, appSource)
    await completed.promise
    assert.ok((await fs.readdir(path.join(outDir, 'assets'))).every((name) => !name.startsWith('extra-')))

    failed = Promise.withResolvers<void>()
    await fs.writeFile(lazyFile, 'export const value = ;\n')
    await failed.promise
    await assert.rejects(fs.access(markerFile), { code: 'ENOENT' })
    await assert.rejects(fs.access(appFile), { code: 'ENOENT' })

    rejectWrite = true
    failed = Promise.withResolvers<void>()
    await fs.writeFile(lazyFile, 'export const value = "write-failure";\n')
    await failed.promise
    await assert.rejects(fs.access(markerFile), { code: 'ENOENT' })

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
    assert.equal(await fs.readFile(sourceFile, 'utf8'), appSource)
})
