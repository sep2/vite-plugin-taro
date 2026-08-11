import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { type DevOptions, dev } from 'rolldown/experimental'
import { asyncScheduler } from 'rxjs'
import { createServer } from 'vite'
import { createHmrResultsStream } from './create-hmr-results-stream.ts'
import type { BundledDev } from './wx-dev-options.ts'

type HmrUpdatesResult = Parameters<NonNullable<DevOptions['onHmrUpdates']>>[0]
type HmrUpdates = Exclude<HmrUpdatesResult, Error>

test('coalesces separate real DevEngine callbacks into one lossless publication', async () => {
    // Three independent modules ensure each patch owns a factory that neither later patch can reconstruct. The test waits for
    // every native callback before editing the next module, defeating Rolldown's filesystem debounce on purpose; all callbacks
    // still land inside the longer RxJS quiet window and must emerge in one publication.
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-hmr-results-stream-')))
    const appId = path.join(root, 'app.js')
    const moduleNames = ['a', 'b', 'c'] as const
    const moduleIds = moduleNames.map((moduleName) => path.join(root, `${moduleName}.js`))
    await Promise.all([
        writeFile(
            appId,
            "import { a } from './a.js'\nimport { b } from './b.js'\nimport { c } from './c.js'\nexport const value = a + b + c\n"
        ),
        ...moduleIds.map((moduleId, index) =>
            writeFile(moduleId, `export const ${moduleNames[index]} = 'initial-${index}'\n`)
        )
    ])

    // These mutable journals distinguish native DevEngine callback count from conflated physical publication count.
    const rawResults: HmrUpdatesResult[] = []
    const publications: HmrUpdates[] = []
    const failures: Error[] = []
    const hmrResults = createHmrResultsStream(
        80,
        asyncScheduler,
        (result) => {
            publications.push(result)
        },
        (error) => {
            failures.push(error)
        }
    )
    const server = await createServer({
        root: root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        experimental: { bundledDev: true },
        build: { rolldownOptions: { input: appId } }
    })
    const bundledDev = requireBundledDev(server.environments.client.bundledDev)
    const rolldownOptions = await bundledDev.getRolldownOptions()
    const output = rolldownOptions.output
    if (!output || Array.isArray(output)) {
        throw new Error('Expected one bundled development output')
    }
    const engine = await dev(rolldownOptions, output, {
        rebuildStrategy: 'never',
        watch: { skipWrite: true },
        onHmrUpdates(result) {
            rawResults.push(result)
            hmrResults.next(result)
        }
    })

    try {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
        await engine.registerClient('hmr-results-stream-test')

        // Waiting for rawResults after each write proves the observed count came from DevEngine rather than synthetic Subject
        // calls. Not notifying payload delivery also exercises Rolldown's real monotonically increasing per-client sequence.
        for (const [index, moduleId] of moduleIds.entries()) {
            await writeFile(moduleId, `export const ${moduleNames[index]} = 'updated-${index}'\n`)
            await waitForCount(rawResults, index + 1)
        }
        await waitForCount(publications, 1)

        // One publication retains all three sequence numbers and physical source identities despite receiving three callbacks.
        assert.equal(rawResults.length, 3)
        assert.equal(publications.length, 1)
        assert.deepEqual(
            publications[0]?.updates.map(({ update }) => (update.type === 'Patch' ? update.seq : undefined)),
            [1, 2, 3]
        )
        assert.deepEqual(new Set(publications[0]?.changedFiles), new Set(moduleIds))
        assert.deepEqual(failures, [])
    } finally {
        hmrResults.complete()
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

async function waitForCount(values: readonly unknown[], expectedCount: number): Promise<void> {
    const startedAt = Date.now()
    while (values.length < expectedCount) {
        if (Date.now() - startedAt > 10_000) {
            throw new Error(`Timed out waiting for event ${expectedCount}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}
