import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { dev } from 'rolldown/experimental'
import { createServer } from 'vite'
import type { BundledDev } from '../wx-dev-options.ts'
import { createStyleCapturePlugin, type ProcessedStyle } from './create-style-capture-plugin.ts'

test('captures PostCSS output from initial and incremental DevEngine transforms', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-host-css-capture-')))
    const appId = path.join(root, 'app.js')
    const cssId = path.join(root, 'app.css')
    await writeFile(appId, "import './app.css'\nexport const value = true\n")
    await writeFile(cssId, '.app { color: red; }\n')

    // These mutable journals synchronize non-awaited DevEngine callbacks and retain each captured generation for assertions.
    const captures: ProcessedStyle[] = []
    const hmrResults: unknown[] = []
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
        createStyleCapturePlugin((_id, style) => {
            captures.push(style)
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
        }
    })

    try {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
        assert.equal(captures.at(-1)?.css, '.app { color: #ff0000; }\n')
        await engine.registerClient('style-capture-test')

        await writeFile(cssId, '.app { color: blue; }\n')
        await waitForEventCount(hmrResults, 1)

        assert.equal(captures.at(-1)?.css, '.app { color: #0000ff; }\n')
        assert.equal(captures.length, 2)
    } finally {
        await engine.close()
        await server.close()
        await rm(root, { recursive: true })
    }
})

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
