import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { type DevEngine, dev } from 'rolldown/experimental'
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

    // These mutable journals retain DevEngine's non-awaited lifecycle results for test synchronization.
    const hmrResults: unknown[] = []
    const outputResults: unknown[] = []
    // This mutable edge serializes physical publication exactly like the production host action reducer.
    let publicationWork = Promise.resolve()
    // DevEngine callbacks run only after assignment and advance the same published frontier as the production host.
    let engine: DevEngine
    const styles = createWxStylePlugin([appId])
    // This one-shot mutable fault proves a failed atomic writer does not advance the plugin's published stylesheet frontier.
    let writeFailure: Error | undefined
    const writeStyle = async (wxss: string): Promise<void> => {
        if (writeFailure) {
            const error = writeFailure
            writeFailure = undefined
            throw error
        }
        await writeHmrFile(outDir, globalWxssFileName, wxss)
    }
    const publish = (result: unknown, results: unknown[], deliveredFileNames: readonly string[]): void => {
        publicationWork = publicationWork.then(async () => {
            try {
                await styles.finalizeUpdate([], writeStyle)
                for (const fileName of deliveredFileNames) {
                    await engine.notifyPayloadDelivered(fileName)
                }
                results.push(result)
            } catch (error) {
                results.push(error)
            }
        })
    }
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
    engine = await dev(rolldownOptions, output, {
        rebuildStrategy: 'never',
        watch: {
            skipWrite: true,
            useDebounce: false,
            usePolling: true,
            pollInterval: 20,
            compareContentsForPolling: true
        },
        onHmrUpdates(result) {
            if (result instanceof Error) {
                hmrResults.push(result)
                return
            }
            const deliveredFileNames = result.updates.flatMap(({ update }) =>
                update.type === 'Patch' ? [update.filename] : []
            )
            publish(result, hmrResults, deliveredFileNames)
        },
        onOutput(result) {
            if (result instanceof Error) {
                outputResults.push(result)
                return
            }
            publish(result, outputResults, [])
        }
    })

    try {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
        await waitForEventCount(outputResults, 1)
        const globalWxssPath = path.join(outDir, globalWxssFileName)
        assert.equal(await readFile(globalWxssPath, 'utf8'), '.app { color: #ff0000; }\n')
        await engine.registerClient('style-plugin-test')

        const colorResultCount = hmrResults.length
        await writeFile(cssId, '.app { color: blue; }\n')
        await waitForEventCount(hmrResults, colorResultCount + 1)
        assert.equal(await readFile(globalWxssPath, 'utf8'), '.app { color: #0000ff; }\n')

        const additionResultCount = hmrResults.length
        await writeFile(appId, "import './app.css'\nimport './extra.css'\nexport const value = 'added'\n")
        await waitForEventCount(hmrResults, additionResultCount + 1)
        assert.match(await readFile(globalWxssPath, 'utf8'), /\.extra \{\}/)

        const removalResultCount = hmrResults.length
        await writeFile(appId, initialSource)
        await waitForEventCount(hmrResults, removalResultCount + 1)
        assert.doesNotMatch(await readFile(globalWxssPath, 'utf8'), /\.extra \{\}/)

        const unchangedInode = (await stat(globalWxssPath)).ino
        const priorResultCount = hmrResults.length
        await writeFile(appId, "import './app.css'\nexport const value = 'unrelated'\n")
        await waitForEventCount(hmrResults, priorResultCount + 1)
        assert.equal((await stat(globalWxssPath)).ino, unchangedInode)

        engine.triggerFullBuild()
        await waitForEventCount(outputResults, 2)

        const durableWxss = await readFile(globalWxssPath, 'utf8')
        const failedResultCount = hmrResults.length
        writeFailure = new Error('simulated atomic WXSS write failure')
        await writeFile(cssId, '.app { color: black; }\n')
        await waitForRawEventCount(hmrResults, failedResultCount + 1)

        assert.match(String(hmrResults[failedResultCount]), /simulated atomic WXSS write failure/)
        assert.equal(await readFile(globalWxssPath, 'utf8'), durableWxss)

        await styles.finalizeUpdate([], writeStyle)
        assert.equal(await readFile(globalWxssPath, 'utf8'), '.app { color: black; }\n')
    } finally {
        await engine.close()
        await publicationWork
        await server.close()
        await rm(root, { recursive: true })
    }
})

test('renders Tailwind CSS and final patch factories from one class set', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-tailwind-style-hmr-')))
    const appId = normalizePath(path.join(root, 'app.js'))
    const cssId = normalizePath(path.join(root, 'app.css'))
    const themeId = normalizePath(path.join(root, 'theme.css'))
    const outDir = path.join(root, 'dist')
    await Promise.all([
        writeFile(appId, renderTailwindApplication('mt-2 bg-brand')),
        writeFile(cssId, '@import "tailwindcss";\n@import "./theme.css";\n@source "./";\n'),
        writeFile(themeId, '@theme { --color-brand: red; }\n')
    ])

    // These mutable journals synchronize callbacks and retain each complete prepared transaction.
    const hmrResults: unknown[] = []
    const outputResults: unknown[] = []
    // This mutable Promise serializes non-awaited callbacks exactly like the production host action reducer.
    let hmrWork = Promise.resolve()
    // DevEngine callbacks run only after assignment and commit every finalized payload before the next source edit.
    let engine: DevEngine
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
    engine = await dev(rolldownOptions, output, {
        rebuildStrategy: 'never',
        watch: {
            skipWrite: false,
            useDebounce: false,
            usePolling: true,
            pollInterval: 20,
            compareContentsForPolling: true
        },
        onHmrUpdates(result) {
            if (result instanceof Error) {
                hmrResults.push(result)
                return
            }
            hmrWork = hmrWork.then(async () => {
                try {
                    const patches = result.updates.flatMap(({ update }) => (update.type === 'Patch' ? [update] : []))
                    const finalized = await styles.finalizeUpdate(patches, writeStyle)
                    for (const patch of patches) {
                        await engine.notifyPayloadDelivered(patch.filename)
                    }
                    hmrResults.push({ codes: finalized.map((patch) => patch.code) })
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
                .finalizeUpdate([], writeStyle)
                .then(() => outputResults.push(result))
                .catch((error: unknown) => outputResults.push(error))
        }
    })

    try {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
        await waitForEventCount(outputResults, 1)
        const globalWxssPath = path.join(outDir, globalWxssFileName)
        const initialWxss = await readFile(globalWxssPath, 'utf8')
        assert.match(initialWxss, /\.mt-2\b/)
        assert.match(initialWxss, /--color-brand:\s*red/)
        await engine.registerClient('tailwind-style-hmr-test')

        const additionStart = hmrResults.length
        await writeFile(appId, renderTailwindApplication('mt-2 py-5.5'))
        const added = await waitForFinalizedHmr(hmrResults, additionStart, (result) =>
            /py-5_d5/.test(result.codes.join('\n'))
        )
        assert.match(await readFile(globalWxssPath, 'utf8'), /\.py-5_d5\b/)
        assert.match(added.codes.join('\n'), /py-5_d5/)
        assert.doesNotMatch(added.codes.join('\n'), /py-5\.5/)

        const removalStart = hmrResults.length
        await writeFile(appId, renderTailwindApplication('mt-2 mr-4.5'))
        const removed = await waitForFinalizedHmr(hmrResults, removalStart, (result) =>
            /mr-4_d5/.test(result.codes.join('\n'))
        )
        const wxss = await readFile(globalWxssPath, 'utf8')
        assert.doesNotMatch(wxss, /\.py-5_d5\b/)
        assert.match(wxss, /\.mr-4_d5\b/)
        assert.match(removed.codes.join('\n'), /mr-4_d5/)

        const dependencyStart = hmrResults.length
        await writeFile(themeId, '@theme { --color-brand: blue; }\n')
        await waitForEventCount(hmrResults, dependencyStart + 1)
        const themedWxss = await readFile(globalWxssPath, 'utf8')
        assert.match(themedWxss, /--color-brand:\s*blue/)
        assert.doesNotMatch(themedWxss, /--color-brand:\s*red/)

        const plainCssStart = hmrResults.length
        await writeFile(cssId, '.plain-root { color: green; }\n')
        await waitForEventCount(hmrResults, plainCssStart + 1)
        const plainWxss = await readFile(globalWxssPath, 'utf8')
        assert.match(plainWxss, /\.plain-root/)
        assert.doesNotMatch(plainWxss, /\.mt-2\b/)
    } finally {
        await engine.close()
        await server.close()
        await rm(root, { recursive: true })
    }
})

function renderTailwindApplication(classes: string): string {
    return `import './app.css'\nexport const props = { className: '${classes}' }\n`
}

function requireFinalizedHmr(value: unknown): Readonly<{ codes: readonly string[] }> {
    if (!value || typeof value !== 'object' || !('codes' in value) || !Array.isArray(value.codes)) {
        throw new Error('Expected finalized HMR code')
    }
    return { codes: value.codes.filter((code): code is string => typeof code === 'string') }
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

async function waitForFinalizedHmr(
    events: readonly unknown[],
    startIndex: number,
    matches: (result: ReturnType<typeof requireFinalizedHmr>) => boolean
): Promise<ReturnType<typeof requireFinalizedHmr>> {
    const startedAt = Date.now()
    while (Date.now() - startedAt <= 10_000) {
        for (const event of events.slice(startIndex)) {
            if (event instanceof Error) throw event
            const finalized = requireFinalizedHmr(event)
            if (matches(finalized)) return finalized
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('Timed out waiting for finalized HMR styles')
}

async function waitForRawEventCount(events: readonly unknown[], expectedCount: number): Promise<void> {
    const startedAt = Date.now()
    while (events.length < expectedCount) {
        if (Date.now() - startedAt > 10_000) {
            throw new Error(`Timed out waiting for raw DevEngine event ${expectedCount}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
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
