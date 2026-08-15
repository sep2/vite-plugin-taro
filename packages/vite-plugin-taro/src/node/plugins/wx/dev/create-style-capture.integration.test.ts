import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { GetModuleInfo } from 'rolldown'
import { dev } from 'rolldown/experimental'
import { Subject } from 'rxjs'
import { createServer, normalizePath } from 'vite'
import { createStyleCapture, type StyleCaptureAction } from './create-style-capture.ts'
import type { BundledDev } from './wx-dev-options.ts'

test('publishes processed CSS and live topology without identical rewrites', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-host-css-capture-')))
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

    // These mutable journals synchronize non-awaited DevEngine callbacks and preserve evidence from each lifecycle generation.
    const capturedCss: string[] = []
    const graphReaders: GetModuleInfo[] = []
    const hmrResults: unknown[] = []
    const outputResults: unknown[] = []
    const styleCaptureActions = new Subject<StyleCaptureAction>()
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
    const styleCapture = createStyleCapture({
        applicationEntryIds: [appId],
        outDir: outDir,
        emit: (action) => styleCaptureActions.next(action)
    })
    styleCaptureActions.subscribe((action) => {
        if (action.kind === 'capture-graph') {
            graphReaders.push(action.getModuleInfo)
            styleCapture.captureGraph(action.getModuleInfo)
            return
        }
        capturedCss.push(action.style.css)
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
        watch: { skipWrite: true },
        onHmrUpdates(result) {
            // Rolldown does not await this callback, exactly like the real host boundary. Defer publication and append the
            // observable result only afterward, so waiting for `hmrResults` proves global.wxss was durable first.
            void Promise.resolve()
                .then(async () => {
                    if (!(result instanceof Error)) {
                        await styleCapture.publish()
                    }
                    hmrResults.push(result)
                })
                .catch((error: unknown) => {
                    hmrResults.push(error)
                })
        },
        onOutput(result) {
            outputResults.push(result)
        }
    })

    try {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
        await waitForEventCount(outputResults, 1)
        assert.equal(capturedCss.at(-1), '.app { color: #ff0000; }\n')
        assert.equal(graphReaders.length, 1)
        const initialReader = requireLatestGraphReader(graphReaders)
        assert.deepEqual(readStyleImports(initialReader, appId), [cssId])
        await engine.registerClient('style-capture-test')

        // This edit exercises the complete ordinary-CSS path: PostCSS capture, live-graph composition, WX finalization, and
        // atomic physical publication. The result journal advances only after all four steps finish.
        await writeFile(cssId, '.app { color: blue; }\n')
        await waitForEventCount(hmrResults, 1)
        assert.equal(capturedCss.at(-1), '.app { color: #0000ff; }\n')
        assert.equal(capturedCss.length, 2)
        assert.equal(await readFile(path.join(outDir, 'assets/global.wxss'), 'utf8'), '.app { color: #0000ff; }\n')
        assert.equal(requireLatestGraphReader(graphReaders), initialReader)

        // Import-only edits validate that the captured reader reflects current topology without rebinding or a shadow graph.
        await writeFile(appId, "import './app.css'\nimport './extra.css'\nexport const value = 'added'\n")
        await waitForEventCount(hmrResults, 2)
        assert.deepEqual(readStyleImports(initialReader, appId), [cssId, extraCssId])
        assert.match(await readFile(path.join(outDir, 'assets/global.wxss'), 'utf8'), /\.extra \{\}/)
        assert.equal(graphReaders.length, 1)

        await writeFile(appId, initialSource)
        await waitForEventCount(hmrResults, 3)
        assert.deepEqual(readStyleImports(initialReader, appId), [cssId])
        const globalWxssPath = path.join(outDir, 'assets/global.wxss')
        assert.doesNotMatch(await readFile(globalWxssPath, 'utf8'), /\.extra \{\}/)

        // An unrelated JavaScript generation still renders for topology correctness, but byte equality must
        // preserve the destination inode and therefore produce no DevTools filesystem event.
        const unchangedInode = (await stat(globalWxssPath)).ino
        await writeFile(appId, "import './app.css'\nexport const value = 'unrelated'\n")
        await waitForEventCount(hmrResults, 4)
        assert.equal((await stat(globalWxssPath)).ino, unchangedInode)

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
    const result = events[expectedCount - 1]
    if (result instanceof Error) {
        throw result
    }
}
