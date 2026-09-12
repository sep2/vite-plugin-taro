import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { InlineConfig, Plugin } from 'vite'
import { build, resolveConfig } from 'vite'
import { createMiniWatchPlugin } from './create-mini-watch-plugin.ts'

const completionPattern = /\/\/ vpt-build:([\da-f-]+)\n$/

/** Supplies one side-effectful entry through Vite's real resolver without needing application dependencies. */
function createVirtualApp(): Plugin {
    return {
        name: 'test:virtual-app',
        resolveId(id) {
            return id === 'virtual:watch-app' ? '\0virtual:watch-app' : null
        },
        load(id) {
            return id === '\0virtual:watch-app' ? 'globalThis.watchFixture = true;' : null
        }
    }
}

test('applies live output policy only to build/watch, including production-mode watchers', async () => {
    const watched = await resolveConfig(
        {
            configFile: false,
            mode: 'production',
            build: { watch: {}, emptyOutDir: true },
            plugins: [createMiniWatchPlugin()]
        },
        'build'
    )
    assert.equal(watched.build.emptyOutDir, false)
    assert.ok(watched.plugins.some(({ name }) => name === 'vpt:mini-watch'))
    for (const command of ['build', 'serve'] as const) {
        const config = await resolveConfig(
            {
                configFile: false,
                build: { emptyOutDir: true },
                plugins: [createMiniWatchPlugin()]
            },
            command
        )
        assert.equal(config.build.emptyOutDir, true)
        assert.ok(!config.plugins.some(({ name }) => name === 'vpt:mini-watch'))
    }
})

test('rejects configured output arrays before starting a watch build', async () => {
    await assert.rejects(
        resolveConfig(
            {
                configFile: false,
                build: { watch: {}, rolldownOptions: { output: [{}, {}] } },
                plugins: [createMiniWatchPlugin()]
            },
            'build'
        ),
        /Mini Program watch requires one configured Rolldown output\./
    )
})

test('rejects missing and asset-only App entries without changing previously published files', async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-watch-invalid-entry-'))
    context.after(() => fs.rm(root, { recursive: true, force: true }))
    const outDir = path.join(root, 'dist')
    const appFile = path.join(outDir, 'app.js')
    const previous = '// previous completed App entry\n'
    await fs.mkdir(outDir)
    await fs.writeFile(appFile, previous)
    for (const assetOnly of [false, true]) {
        const fixture: Plugin = {
            ...createVirtualApp(),
            generateBundle() {
                if (assetOnly) {
                    this.emitFile({ type: 'asset', fileName: 'app.js', source: 'not an entry chunk' })
                }
            }
        }
        await assert.rejects(
            build({
                root,
                configFile: false,
                logLevel: 'silent',
                // A single physical write exercises the same hooks without leaving a watcher running after the error.
                plugins: [fixture, { ...createMiniWatchPlugin(), apply: 'build' }],
                build: {
                    outDir,
                    rolldownOptions: {
                        input: { 'other.js': 'virtual:watch-app' },
                        output: { entryFileNames: '[name]' }
                    }
                }
            }),
            /Mini Program watch output requires an app\.js entry chunk\./
        )
        assert.equal(await fs.readFile(appFile, 'utf8'), previous)
        assert.deepEqual(await fs.readdir(outDir), ['app.js'])
    }
})

test('rejects publication without an App handoff, including after an earlier successful build', async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-watch-entry-handoff-'))
    context.after(() => fs.rm(root, { recursive: true, force: true }))
    const outDir = path.join(root, 'dist')
    const appFile = path.join(outDir, 'app.js')
    const plugin = { ...createMiniWatchPlugin(), apply: 'build' as const }
    const config = {
        root,
        configFile: false,
        logLevel: 'silent',
        build: {
            outDir,
            rolldownOptions: {
                input: { 'app.js': 'virtual:watch-app' },
                output: { entryFileNames: '[name]' }
            }
        }
    } satisfies InlineConfig
    async function rejectMissingHandoff(): Promise<void> {
        await assert.rejects(
            build({
                ...config,
                // Suppress only the handoff; Vite still supplies the real buildStart/writeBundle contexts. Reusing the
                // descriptor after success proves buildStart discards the previous generation rather than publishing it.
                plugins: [createVirtualApp(), { ...plugin, generateBundle: undefined }]
            }),
            /Mini Program watch has no completed App entry to publish\./
        )
        assert.doesNotMatch(await fs.readFile(appFile, 'utf8'), completionPattern)
    }
    await rejectMissingHandoff()
    await build({ ...config, plugins: [createVirtualApp(), plugin] })
    assert.match(await fs.readFile(appFile, 'utf8'), completionPattern)
    await rejectMissingHandoff()
})

test('keeps the App chunk in generate-only output instead of transferring it to the file writer', async () => {
    const result = await build({
        configFile: false,
        logLevel: 'silent',
        plugins: [
            createVirtualApp(),
            // Exercise the generate-only lifecycle without starting a persistent watcher in this single-build test.
            { ...createMiniWatchPlugin(), apply: 'build' }
        ],
        build: {
            write: false,
            rolldownOptions: {
                input: { 'app.js': 'virtual:watch-app' },
                output: { entryFileNames: '[name]' }
            }
        }
    })
    assert.ok(!Array.isArray(result) && 'output' in result)
    assert.ok(result.output.some((output) => output.fileName === 'app.js' && output.type === 'chunk'))
})

test('publishes App exactly once after complete watch output; retains the previous entry on failed writes', {
    timeout: 30_000
}, async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-watch-publication-'))
    const outDir = path.join(root, 'dist')
    const appFile = path.join(outDir, 'app.js')
    const lazyFile = path.join(root, 'lazy.js')
    const appSource = 'export const load = () => import("./lazy.js");\n'
    await fs.writeFile(path.join(root, 'app.js'), appSource)
    await fs.writeFile(lazyFile, 'export const value = "generation-one";\n')
    await fs.mkdir(path.join(outDir, 'retained'), { recursive: true })
    await fs.writeFile(path.join(outDir, 'retained/sentinel.txt'), 'keep this directory')
    const directoryInode = (await fs.stat(path.join(outDir, 'retained'))).ino

    const firstWritten = Promise.withResolvers<void>()
    const releaseFirstWrite = Promise.withResolvers<void>()
    // The test advances one watch transaction at a time; these promises and flags represent the current controlled build.
    let completed = Promise.withResolvers<void>()
    let failed = Promise.withResolvers<void>()
    let firstWrite = true
    let rejectWrite = false
    const publicationGate: Plugin = {
        name: 'test:publication-gate',
        enforce: 'post',
        generateBundle() {
            this.emitFile({ type: 'asset', fileName: 'app.json', source: '{"pages":[]}' })
            this.emitFile({ type: 'asset', fileName: 'native/component.wxml', source: '<view />' })
        },
        writeBundle: {
            order: 'post',
            sequential: true,
            async handler(_options, bundle) {
                assert.ok(Object.values(bundle).every((output) => output.fileName !== 'app.js'))
                assert.equal(await fs.readFile(path.join(outDir, 'native/component.wxml'), 'utf8'), '<view />')
                assert.equal(await fs.readFile(path.join(outDir, 'app.json'), 'utf8'), '{"pages":[]}')
                if (firstWrite) {
                    firstWrite = false
                    firstWritten.resolve()
                    await releaseFirstWrite.promise
                }
                if (rejectWrite) {
                    throw new Error('test: output publication rejected')
                }
            }
        }
    }
    const watcher = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [publicationGate, createMiniWatchPlugin()],
        build: {
            outDir,
            watch: {},
            minify: false,
            rolldownOptions: {
                input: { 'app.js': path.join(root, 'app.js') },
                preserveEntrySignatures: 'allow-extension',
                output: {
                    entryFileNames: '[name]-[hash]',
                    chunkFileNames: 'assets/[name]-[hash].js'
                }
            }
        }
    })
    assert.ok(!Array.isArray(watcher) && 'on' in watcher)
    context.after(async () => {
        releaseFirstWrite.resolve()
        await watcher.close()
        await fs.rm(root, { recursive: true, force: true })
    })
    watcher.on('event', (event) => {
        if (event.code === 'BUNDLE_END') {
            completed.resolve()
        }
        if (event.code === 'ERROR') {
            failed.resolve()
        }
    })

    await firstWritten.promise
    await assert.rejects(fs.readFile(appFile), { code: 'ENOENT' })
    assert.match(await fs.readFile(path.join(outDir, 'assets/lazy.js'), 'utf8'), /generation-one/)
    releaseFirstWrite.resolve()
    await completed.promise
    const initial = await fs.readFile(appFile, 'utf8')
    assert.match(initial, completionPattern)

    completed = Promise.withResolvers<void>()
    await fs.writeFile(lazyFile, 'export const value = "generation-two";\n')
    await completed.promise
    const second = await fs.readFile(appFile, 'utf8')
    assert.match(second, completionPattern)
    assert.notEqual(second, initial)
    assert.equal(second.replace(completionPattern, ''), initial.replace(completionPattern, ''))
    assert.match(await fs.readFile(path.join(outDir, 'assets/lazy.js'), 'utf8'), /generation-two/)
    assert.equal((await fs.stat(path.join(outDir, 'retained'))).ino, directoryInode)

    rejectWrite = true
    failed = Promise.withResolvers<void>()
    await fs.writeFile(lazyFile, 'export const value = "unpublished-generation";\n')
    await failed.promise
    assert.equal(await fs.readFile(appFile, 'utf8'), second)

    rejectWrite = false
    completed = Promise.withResolvers<void>()
    await fs.writeFile(lazyFile, 'export const value = "recovered-generation";\n')
    await completed.promise
    const recovered = await fs.readFile(appFile, 'utf8')
    assert.match(recovered, completionPattern)
    assert.notEqual(recovered, second)
    assert.match(await fs.readFile(path.join(outDir, 'assets/lazy.js'), 'utf8'), /recovered-generation/)
    assert.ok((await fs.readdir(outDir)).every((name) => !name.startsWith('.app.js.')))
})
