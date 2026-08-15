import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { dev } from 'rolldown/experimental'
import { createServer, normalizePath } from 'vite'
import { globalWxssFileName, writeHmrFile } from '../dev/hmr-files.ts'
import type { BundledDev } from '../dev/wx-dev-options.ts'
import { createWxStylePlugin } from './plugins.ts'

test('publishes processed CSS and live topology without identical rewrites', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-style-plugin-')))
    const appId = normalizePath(path.join(root, 'app.js'))
    const cssId = normalizePath(path.join(root, 'app.css'))
    const extraCssId = normalizePath(path.join(root, 'extra.css'))
    const outDir = path.join(root, 'dist')
    const initialSource = "import './app.css'\nexport const value = 'initial'\n"
    await Promise.all([
        writeFile(appId, initialSource),
        writeFile(cssId, '.app { color: red; }\n'),
        writeFile(extraCssId, '.extra {}\n')
    ])

    // These mutable journals synchronize DevEngine's non-awaited lifecycle callbacks.
    const hmrResults: unknown[] = []
    const outputResults: unknown[] = []
    const styles = createWxStylePlugin([appId])
    const writeStyle = (wxss: string) => writeHmrFile(outDir, globalWxssFileName, wxss)
    const server = await createServer({
        root: root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        experimental: { bundledDev: true },
        plugins: [
            styles,
            {
                name: 'test:rewrite-color',
                config() {
                    return {
                        css: {
                            postcss: {
                                plugins: [
                                    {
                                        postcssPlugin: 'test:rewrite-color-postcss',
                                        Declaration(declaration) {
                                            if (declaration.prop === 'color' && declaration.value === 'red') {
                                                declaration.value = '#ff0000'
                                            }
                                            if (declaration.prop === 'color' && declaration.value === 'blue') {
                                                declaration.value = '#0000ff'
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            }
        ],
        build: {
            outDir: outDir,
            rolldownOptions: { input: appId }
        }
    })
    const bundledDev = requireBundledDev(server.environments.client.bundledDev)
    const rolldownOptions = await bundledDev.getRolldownOptions()
    const output = rolldownOptions.output
    if (!output || Array.isArray(output)) {
        throw new Error('Expected one bundled development output')
    }
    const engine = await dev(rolldownOptions, output, {
        rebuildStrategy: 'never',
        watch: { skipWrite: true, useDebounce: false },
        onHmrUpdates(result) {
            if (result instanceof Error) {
                hmrResults.push(result)
                return
            }
            void styles
                .prepare()
                .then((generation) => styles.publish(generation.wxss, writeStyle))
                .then(() => hmrResults.push(result))
                .catch((error: unknown) => hmrResults.push(error))
        },
        onOutput(result) {
            if (result instanceof Error) {
                outputResults.push(result)
                return
            }
            void styles
                .prepare()
                .then((generation) => styles.publish(generation.wxss, writeStyle))
                .then(() => outputResults.push(result))
                .catch((error: unknown) => outputResults.push(error))
        }
    })

    try {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
        await waitForEventCount(outputResults, 1)
        const globalWxssPath = path.join(outDir, globalWxssFileName)
        assert.equal(await readFile(globalWxssPath, 'utf8'), '.app { color: #ff0000; }\n')
        await engine.registerClient('style-plugin-test')

        await writeFile(cssId, '.app { color: blue; }\n')
        await waitForStyle(globalWxssPath, (wxss) => wxss === '.app { color: #0000ff; }\n', hmrResults)

        await writeFile(appId, "import './app.css'\nimport './extra.css'\nexport const value = 'added'\n")
        await waitForStyle(globalWxssPath, (wxss) => /\.extra \{\}/.test(wxss), hmrResults)

        await writeFile(appId, initialSource)
        await waitForStyle(globalWxssPath, (wxss) => !/\.extra \{\}/.test(wxss), hmrResults)

        const unchangedInode = (await stat(globalWxssPath)).ino
        const priorResultCount = hmrResults.length
        await writeFile(appId, "import './app.css'\nexport const value = 'unrelated'\n")
        await waitForEventCount(hmrResults, priorResultCount + 1)
        assert.equal((await stat(globalWxssPath)).ino, unchangedInode)

        engine.triggerFullBuild()
        await waitForEventCount(outputResults, 2)
    } finally {
        await engine.close()
        await server.close()
        await rm(root, { recursive: true })
    }
})

test('prepares Tailwind CSS and final patch factories from one class set', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-tailwind-style-hmr-')))
    const appId = normalizePath(path.join(root, 'app.js'))
    const cssId = normalizePath(path.join(root, 'app.css'))
    const outDir = path.join(root, 'dist')
    await Promise.all([
        writeFile(appId, renderTailwindApplication('mt-2')),
        writeFile(cssId, '@import "tailwindcss";\n@source "./";\n')
    ])

    // These mutable journals synchronize callbacks and retain each complete prepared transaction.
    const hmrResults: unknown[] = []
    const outputResults: unknown[] = []
    // This mutable Promise serializes non-awaited callbacks exactly like the production host action reducer.
    let hmrWork = Promise.resolve()
    const styles = createWxStylePlugin([appId])
    const writeStyle = (wxss: string) => writeHmrFile(outDir, globalWxssFileName, wxss)
    const server = await createServer({
        root: root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        experimental: { bundledDev: true },
        plugins: [styles],
        build: {
            outDir: outDir,
            cssCodeSplit: false,
            cssMinify: false,
            rolldownOptions: { input: appId }
        }
    })
    const bundledDev = requireBundledDev(server.environments.client.bundledDev)
    const rolldownOptions = await bundledDev.getRolldownOptions()
    const output = rolldownOptions.output
    if (!output || Array.isArray(output)) {
        throw new Error('Expected one bundled development output')
    }
    const engine = await dev(rolldownOptions, output, {
        rebuildStrategy: 'never',
        watch: { skipWrite: false, useDebounce: false },
        onHmrUpdates(result) {
            if (result instanceof Error) {
                hmrResults.push(result)
                return
            }
            hmrWork = hmrWork.then(async () => {
                try {
                    const generation = await styles.prepare()
                    // This transaction-local array preserves patch order while applying one shared class set.
                    const codes: string[] = []
                    for (const { update } of result.updates) {
                        if (update.type !== 'Patch') continue
                        codes.push(await styles.finalizeJavaScript(update.code, generation.classSet, update.filename))
                    }
                    await styles.publish(generation.wxss, writeStyle)
                    hmrResults.push({ codes: codes, generation: generation })
                } catch (error) {
                    hmrResults.push(error)
                }
            })
        },
        onOutput(result) {
            if (result instanceof Error) {
                outputResults.push(result)
                return
            }
            void styles
                .prepare()
                .then((generation) => styles.publish(generation.wxss, writeStyle))
                .then(() => outputResults.push(result))
                .catch((error: unknown) => outputResults.push(error))
        }
    })

    try {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
        await waitForEventCount(outputResults, 1)
        const globalWxssPath = path.join(outDir, globalWxssFileName)
        assert.match(await readFile(globalWxssPath, 'utf8'), /\.mt-2\b/)
        await engine.registerClient('tailwind-style-hmr-test')

        const additionStart = hmrResults.length
        await writeFile(appId, renderTailwindApplication('mt-2 py-5.5'))
        const added = await waitForPreparedHmr(
            hmrResults,
            additionStart,
            (result) => result.generation.classSet.has('py-5.5') && /py-5_d5/.test(result.codes.join('\n'))
        )
        assert.equal(added.generation.classSet.has('py-5.5'), true)
        assert.match(await readFile(globalWxssPath, 'utf8'), /\.py-5_d5\b/)
        assert.match(added.codes.join('\n'), /py-5_d5/)
        assert.doesNotMatch(added.codes.join('\n'), /py-5\.5/)

        const removalStart = hmrResults.length
        await writeFile(appId, renderTailwindApplication('mt-2 mr-4.5'))
        const removed = await waitForPreparedHmr(
            hmrResults,
            removalStart,
            (result) =>
                result.generation.classSet.has('mr-4.5') &&
                !result.generation.classSet.has('py-5.5') &&
                /mr-4_d5/.test(result.codes.join('\n'))
        )
        const wxss = await readFile(globalWxssPath, 'utf8')
        assert.equal(removed.generation.classSet.has('py-5.5'), false)
        assert.doesNotMatch(wxss, /\.py-5_d5\b/)
        assert.match(wxss, /\.mr-4_d5\b/)
        assert.match(removed.codes.join('\n'), /mr-4_d5/)
    } finally {
        await engine.close()
        await server.close()
        await rm(root, { recursive: true })
    }
})

function renderTailwindApplication(classes: string): string {
    return `import './app.css'\nexport const props = { className: '${classes}' }\n`
}

function requirePreparedHmr(value: unknown): Readonly<{
    codes: readonly string[]
    generation: Readonly<{ classSet: Set<string> }>
}> {
    if (!value || typeof value !== 'object' || !('codes' in value) || !('generation' in value)) {
        throw new Error('Expected one prepared HMR transaction')
    }
    const codes = value.codes
    const generation = value.generation
    if (!Array.isArray(codes) || !generation || typeof generation !== 'object' || !('classSet' in generation)) {
        throw new Error('Expected prepared HMR codes and class set')
    }
    const classSet = generation.classSet
    if (!(classSet instanceof Set)) {
        throw new Error('Expected a prepared Tailwind class set')
    }
    return {
        codes: codes.filter((code): code is string => typeof code === 'string'),
        generation: { classSet: classSet }
    }
}

function requireBundledDev(value: unknown): BundledDev {
    if (!isBundledDev(value)) {
        throw new Error('Expected Vite bundled development')
    }
    return value
}

function isBundledDev(value: unknown): value is BundledDev {
    return (
        typeof value === 'object' &&
        value !== null &&
        'getRolldownOptions' in value &&
        typeof value.getRolldownOptions === 'function' &&
        'listen' in value &&
        typeof value.listen === 'function' &&
        'triggerBundleRegenerationIfStale' in value &&
        typeof value.triggerBundleRegenerationIfStale === 'function'
    )
}

async function waitForPreparedHmr(
    events: readonly unknown[],
    startIndex: number,
    matches: (result: ReturnType<typeof requirePreparedHmr>) => boolean
): Promise<ReturnType<typeof requirePreparedHmr>> {
    const startedAt = Date.now()
    while (Date.now() - startedAt <= 10_000) {
        for (const event of events.slice(startIndex)) {
            if (event instanceof Error) throw event
            const prepared = requirePreparedHmr(event)
            if (matches(prepared)) return prepared
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('Timed out waiting for prepared HMR styles')
}

async function waitForStyle(
    fileName: string,
    matches: (wxss: string) => boolean,
    events: readonly unknown[]
): Promise<void> {
    const startedAt = Date.now()
    while (Date.now() - startedAt <= 10_000) {
        const error = events.find((event) => event instanceof Error)
        if (error instanceof Error) throw error
        if (matches(await readFile(fileName, 'utf8'))) return
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(`Timed out waiting for WXSS: ${fileName}`)
}

async function waitForEventCount(events: readonly unknown[], expectedCount: number): Promise<void> {
    const startedAt = Date.now()
    while (events.length < expectedCount) {
        if (Date.now() - startedAt > 10_000) {
            throw new Error(`Timed out waiting for DevEngine event ${expectedCount}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    const result = events[expectedCount - 1]
    if (result instanceof Error) {
        throw result
    }
}
