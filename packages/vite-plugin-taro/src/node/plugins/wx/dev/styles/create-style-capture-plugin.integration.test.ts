import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { GetModuleInfo } from 'rolldown'
import { dev } from 'rolldown/experimental'
import { createServer } from 'vite'
import type { BundledDev } from '../wx-dev-options.ts'
import { createStyleCapturePlugin, type ProcessedStyle } from './create-style-capture-plugin.ts'

test('captures processed CSS and a live graph across DevEngine updates', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-host-css-capture-')))
    const appId = path.join(root, 'app.js')
    const cssId = path.join(root, 'app.css')
    const extraCssId = path.join(root, 'extra.css')
    const initialSource = "import './app.css'\nexport const value = 'initial'\n"
    await Promise.all([
        writeFile(appId, initialSource),
        writeFile(cssId, '.app { color: red; }\n'),
        writeFile(extraCssId, '.extra {}\n')
    ])

    // These mutable journals synchronize non-awaited DevEngine callbacks and retain captured lifecycle generations.
    const captures: ProcessedStyle[] = []
    const graphReaders: GetModuleInfo[] = []
    const hmrResults: unknown[] = []
    const outputResults: unknown[] = []
    const server = await createServer({
        root: root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        experimental: { bundledDev: true },
        css: {
            postcss: {
                plugins: [
                    {
                        postcssPlugin: 'test:rewrite-color',
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
        },
        build: { rolldownOptions: { input: appId } }
    })
    const bundledDev = requireBundledDev(server.environments.client.bundledDev)
    const rolldownOptions = await bundledDev.getRolldownOptions()
    rolldownOptions.plugins = [
        rolldownOptions.plugins,
        createStyleCapturePlugin({
            captureGraph(reader) {
                graphReaders.push(reader)
            },
            captureStyle(_id, style) {
                captures.push(style)
            }
        })
    ]
    const output = rolldownOptions.output
    if (!output || Array.isArray(output)) {
        throw new Error('Expected one bundled development output')
    }
    const engine = await dev(rolldownOptions, output, {
        rebuildStrategy: 'never',
        watch: { skipWrite: true },
        onHmrUpdates(result) {
            hmrResults.push(result)
        },
        onOutput(result) {
            outputResults.push(result)
        }
    })

    try {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
        await waitForEventCount(outputResults, 1)
        assert.equal(captures.at(-1)?.css, '.app { color: #ff0000; }\n')
        assert.equal(graphReaders.length, 1)
        const initialReader = requireLatestGraphReader(graphReaders)
        assert.deepEqual(readStyleImports(initialReader, appId), [cssId])
        await engine.registerClient('style-capture-test')

        await writeFile(cssId, '.app { color: blue; }\n')
        await waitForEventCount(hmrResults, 1)
        assert.equal(captures.at(-1)?.css, '.app { color: #0000ff; }\n')
        assert.equal(captures.length, 2)
        assert.equal(requireLatestGraphReader(graphReaders), initialReader)

        await writeFile(appId, "import './app.css'\nimport './extra.css'\nexport const value = 'added'\n")
        await waitForEventCount(hmrResults, 2)
        assert.deepEqual(readStyleImports(initialReader, appId), [cssId, extraCssId])
        assert.equal(graphReaders.length, 1)

        await writeFile(appId, initialSource)
        await waitForEventCount(hmrResults, 3)
        assert.deepEqual(readStyleImports(initialReader, appId), [cssId])

        engine.triggerFullBuild()
        await waitForEventCount(outputResults, 2)
        assert.equal(graphReaders.length, 2)
        assert.notEqual(requireLatestGraphReader(graphReaders), initialReader)
        assert.deepEqual(readStyleImports(requireLatestGraphReader(graphReaders), appId), [cssId])
    } finally {
        await engine.close()
        await server.close()
        await rm(root, { recursive: true })
    }
})

function requireLatestGraphReader(graphReaders: readonly GetModuleInfo[]): GetModuleInfo {
    const reader = graphReaders.at(-1)
    if (!reader) {
        throw new Error('Expected a live Rolldown graph reader')
    }
    return reader
}

function readStyleImports(getModuleInfo: GetModuleInfo, moduleId: string): readonly string[] {
    const moduleInfo = getModuleInfo(moduleId)
    if (!moduleInfo) {
        throw new Error(`Expected Rolldown graph module: ${moduleId}`)
    }
    return moduleInfo.importedIds.filter((importedId) => importedId.endsWith('.css'))
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

async function waitForEventCount(events: readonly unknown[], expectedCount: number): Promise<void> {
    const startedAt = Date.now()
    while (events.length < expectedCount) {
        if (Date.now() - startedAt > 10_000) {
            throw new Error(`Timed out waiting for DevEngine event ${expectedCount}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}
