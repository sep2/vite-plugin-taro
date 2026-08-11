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

test('adapts a real DevEngine callback into one publication', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-hmr-results-stream-')))
    const appId = path.join(root, 'app.js')
    const dependencyId = path.join(root, 'dependency.js')
    await Promise.all([
        writeFile(appId, "import { value } from './dependency.js'\nexport const current = value\n"),
        writeFile(dependencyId, "export const value = 'initial'\n")
    ])

    // These mutable journals prove the adapter receives Rolldown's real callback rather than only synthetic Subject values.
    const publications: HmrUpdates[] = []
    const failures: Error[] = []
    const hmrResults = createHmrResultsStream(
        32,
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
        watch: { skipWrite: true, useDebounce: false },
        onHmrUpdates(result) {
            hmrResults.next(result)
        }
    })

    try {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
        await engine.registerClient('hmr-results-stream-test')

        await writeFile(dependencyId, "export const value = 'updated'\n")
        await waitFor(() => countPatches(publications) >= 1)

        assert.deepEqual(
            publications.flatMap(({ updates }) =>
                updates.flatMap(({ update }) => (update.type === 'Patch' ? [update.seq] : []))
            ),
            [1]
        )
        assert.deepEqual(failures, [])
    } finally {
        hmrResults.complete()
        await engine.close()
        await server.close()
        await rm(root, { recursive: true })
    }
})

test('surfaces a real transform failure and accepts a later recovery generation', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-hmr-recovery-')))
    const appId = path.join(root, 'app.js')
    const dependencyId = path.join(root, 'dependency.js')
    await Promise.all([
        writeFile(appId, "import { value } from './dependency.js'\nexport const current = value\n"),
        writeFile(dependencyId, "export const value = 'initial'\n")
    ])

    // Separate journals prove a transform failure contributes no payload, starts no complete build, and resumes ordinary HMR.
    const failures: Error[] = []
    const publications: HmrUpdates[] = []
    const outputResults: unknown[] = []
    const hmrResults = createHmrResultsStream(
        32,
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
        watch: { skipWrite: true, useDebounce: false },
        onHmrUpdates(result) {
            hmrResults.next(result)
        },
        onOutput(result) {
            outputResults.push(result)
        }
    })

    try {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
        await waitForCount(outputResults, 1)
        await engine.registerClient('hmr-recovery-test')

        await writeFile(dependencyId, 'export const value = ;\n')
        await waitForCount(failures, 1)
        await engine.ensureCurrentBuildFinish()
        assert.equal(countPatches(publications), 0)

        // The invalid generation leaves the old runtime frontier healthy. Once the source parses again, Rolldown emits the
        // ordinary next patch without a complete build or special recovery state.
        await writeFile(dependencyId, "export const value = 'recovered'\n")
        await waitFor(() => countPatches(publications) >= 1)
        await engine.ensureCurrentBuildFinish()

        assert.equal(failures.length, 1)
        assert.equal(outputResults.length, 1)
        assert.deepEqual(
            publications.flatMap(({ updates }) =>
                updates.flatMap(({ update }) => (update.type === 'Patch' ? [update.seq] : []))
            ),
            [1]
        )
    } finally {
        hmrResults.complete()
        await engine.close()
        await server.close()
        await rm(root, { recursive: true })
    }
})

function countPatches(results: readonly HmrUpdatesResult[]): number {
    return results.reduce(
        (count, result) =>
            result instanceof Error
                ? count
                : count + result.updates.filter(({ update }) => update.type === 'Patch').length,
        0
    )
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

async function waitForCount(values: readonly unknown[], expectedCount: number): Promise<void> {
    await waitFor(() => values.length >= expectedCount)
}

async function waitFor(predicate: () => boolean): Promise<void> {
    const startedAt = Date.now()
    while (!predicate()) {
        if (Date.now() - startedAt > 20_000) {
            throw new Error('Timed out waiting for DevEngine state')
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}
