import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { dev } from 'rolldown/experimental'
import { Subject } from 'rxjs'
import { createServer, normalizePath } from 'vite'
import { createWxStylePlugins } from '../../styles/plugins.ts'
import type { BundledDev } from '../wx-dev-options.ts'
import { createStyleCapture, type StyleCaptureAction } from './create-style-capture.ts'

test('publishes Tailwind candidate additions and removals before completing each HMR transaction', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-tailwind-style-hmr-')))
    const appId = normalizePath(path.join(root, 'app.js'))
    const cssId = normalizePath(path.join(root, 'app.css'))
    const outDir = path.join(root, 'dist')
    await Promise.all([
        writeFile(appId, renderApplication('mt-2')),
        writeFile(cssId, '@import "tailwindcss";\n@source "./";\n')
    ])

    // These mutable journals synchronize Rolldown's non-awaited callbacks and prove stable sidecar identity across generations.
    const hmrResults: unknown[] = []
    const outputResults: unknown[] = []
    const sidecarIds: string[] = []
    const styleCaptureActions = new Subject<StyleCaptureAction>()
    const server = await createServer({
        root: root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        experimental: { bundledDev: true },
        plugins: createWxStylePlugins(),
        build: {
            outDir: outDir,
            cssCodeSplit: false,
            cssMinify: false,
            rolldownOptions: { input: appId }
        }
    })
    const styleCapture = createStyleCapture({
        applicationEntryIds: [appId],
        outDir: outDir,
        emit: (action) => styleCaptureActions.next(action),
        transformTailwindRoot: async (rootId, requestId) => {
            sidecarIds.push(requestId)
            const source = await readFile(rootId, 'utf8')
            return server.environments.client.pluginContainer.transform(source, requestId)
        }
    })
    styleCaptureActions.subscribe((action) => {
        if (action.kind === 'capture-graph') {
            styleCapture.captureGraph(action.getModuleInfo)
            return
        }
        styleCapture.captureStyle(action.id, action.style)
    })
    const bundledDev = requireBundledDev(server.environments.client.bundledDev)
    const rolldownOptions = await bundledDev.getRolldownOptions()
    rolldownOptions.plugins = [rolldownOptions.plugins, styleCapture.plugin]
    const output = rolldownOptions.output
    if (!output || Array.isArray(output)) {
        throw new Error('Expected one bundled development output')
    }
    const engine = await dev(rolldownOptions, output, {
        rebuildStrategy: 'never',
        watch: { skipWrite: false },
        onHmrUpdates(result) {
            if (result instanceof Error) {
                hmrResults.push(result)
                return
            }
            void Promise.resolve()
                .then(async () => {
                    await styleCapture.publishChanged(
                        result.updates.flatMap(({ update }) => (update.type === 'Patch' ? update.changedIds : []))
                    )
                    hmrResults.push(result)
                })
                .catch((error: unknown) => {
                    hmrResults.push(error)
                })
        },
        onOutput(result) {
            if (result instanceof Error) {
                outputResults.push(result)
                return
            }
            void readFile(path.join(outDir, 'assets/global.wxss'), 'utf8')
                .then((wxss) => {
                    styleCapture.bindPublishedWxss(wxss)
                    outputResults.push(wxss)
                })
                .catch((error: unknown) => {
                    outputResults.push(error)
                })
        }
    })

    try {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
        await waitForSuccessfulEvent(outputResults, 1)
        assert.match(String(outputResults[0]), /\.mt-2\b/)
        await engine.registerClient('tailwind-style-hmr-test')

        await writeFile(appId, renderApplication('mt-2 p-4'))
        await waitForSuccessfulEvent(hmrResults, 1)
        const addedWxss = await readFile(path.join(outDir, 'assets/global.wxss'), 'utf8')
        assert.match(addedWxss, /\.mt-2\b/)
        assert.match(addedWxss, /\.p-4\b/)

        await writeFile(appId, renderApplication('p-4'))
        await waitForSuccessfulEvent(hmrResults, 2)
        const removedWxss = await readFile(path.join(outDir, 'assets/global.wxss'), 'utf8')
        assert.doesNotMatch(removedWxss, /\.mt-2\b/)
        assert.match(removedWxss, /\.p-4\b/)
        assert.deepEqual(sidecarIds, [`${cssId}?weapp-vite-sidecar=style`, `${cssId}?weapp-vite-sidecar=style`])
        assert.equal(server.environments.client.moduleGraph.getModuleById(sidecarIds[0]), undefined)
    } finally {
        await engine.close()
        await server.close()
        await rm(root, { recursive: true })
    }
})

function renderApplication(classes: string): string {
    return `import './app.css'\nexport const classes = '${classes}'\n`
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

async function waitForSuccessfulEvent(events: readonly unknown[], expectedCount: number): Promise<void> {
    const startedAt = Date.now()
    while (events.length < expectedCount) {
        if (Date.now() - startedAt > 10_000) {
            throw new Error(`Timed out waiting for development event ${expectedCount}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    const result = events[expectedCount - 1]
    if (result instanceof Error) {
        throw result
    }
}
