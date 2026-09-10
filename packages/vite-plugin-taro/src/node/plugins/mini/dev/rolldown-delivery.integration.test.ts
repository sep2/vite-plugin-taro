import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'
import { dev } from 'rolldown/experimental'
import { DevRuntime } from 'rolldown/experimental/runtime'
import { createServer } from 'vite'
import type { PatchUpdate } from './hmr-protocol.ts'
import { type BundledDev, requireSingleOutput } from './mini-dev-options.ts'

/** Atomically exposes one edit so each observed callback corresponds to a complete source generation. */
async function publishSource(filePath: string, source: string): Promise<void> {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, source)
    await rename(temporaryPath, filePath)
}

function renderModule(marker: string): string {
    return `export const value = '${marker}'\nif (import.meta.hot) { import.meta.hot.accept() }\n`
}

/** The fixture evaluates module values, not Refresh callbacks; generated factories only need the accept registration surface. */
class RegistrationRuntime extends DevRuntime {
    override createModuleHotContext(_moduleId: string): Readonly<{ accept: () => void }> {
        return { accept() {} }
    }
}

function createBaseline(firstId: string, secondId: string): RegistrationRuntime {
    const runtime = new RegistrationRuntime('delivery-test')
    runtime.registerGraph({ ids: [firstId, secondId], localCount: 2, edges: [[], []], dynamicEdges: [[], []] })
    runtime.registerModule(firstId, { exports: { value: 'first-original' } })
    runtime.registerModule(secondId, { exports: { value: 'second-original' } })
    return runtime
}

function applyRegistration(runtime: RegistrationRuntime, patch: PatchUpdate): void {
    runInNewContext(patch.code, { __rolldown_runtime__: runtime }, { filename: patch.filename })
    for (const id of patch.changedIds) {
        runtime.removeModuleCache(id)
        runtime.initModule(id)
    }
}

function readValue(exports: unknown): string {
    assert.ok(
        exports !== null && typeof exports === 'object' && 'value' in exports && typeof exports.value === 'string'
    )
    return exports.value
}

function hasBundledOptions(value: unknown): value is Pick<BundledDev, 'getRolldownOptions'> {
    return (
        value !== null &&
        typeof value === 'object' &&
        'getRolldownOptions' in value &&
        typeof value.getRolldownOptions === 'function'
    )
}

function requireBundledDev(value: unknown): Pick<BundledDev, 'getRolldownOptions'> {
    assert.ok(hasBundledOptions(value), 'Expected Vite bundled development options')
    return value
}

async function createFixture() {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-rolldown-delivery-')))
    const firstPath = path.join(root, 'first.js')
    const secondPath = path.join(root, 'second.js')
    const entryPath = path.join(root, 'entry.js')
    await Promise.all([
        writeFile(firstPath, renderModule('first-original')),
        writeFile(secondPath, renderModule('second-original')),
        writeFile(
            entryPath,
            "import { value as first } from './first.js'\nimport { value as second } from './second.js'\nexport const values = [first, second]\nif (import.meta.hot) { import.meta.hot.accept() }\n"
        )
    ])
    const server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        experimental: { bundledDev: true },
        build: { rolldownOptions: { input: entryPath } }
    })
    const bundledDev = requireBundledDev(server.environments.client.bundledDev)
    const options = await bundledDev.getRolldownOptions()
    // Match VPT's complete initial graph rather than browser lazy compilation.
    options.experimental = { ...options.experimental, devMode: { lazy: false } }
    // These append-only observations capture actual DevEngine callbacks, with no VPT patch journal or stream adapter.
    const patches: PatchUpdate[] = []
    const failures: unknown[] = []
    const engine = await dev(options, requireSingleOutput(options), {
        rebuildStrategy: 'never',
        watch: { skipWrite: true, useDebounce: true },
        onHmrUpdates(result) {
            if (result instanceof Error) {
                failures.push(result)
                return
            }
            for (const { update } of result.updates) {
                if (update.type === 'Patch') {
                    patches.push(update)
                } else if (update.type !== 'Noop') {
                    failures.push(update)
                }
            }
        }
    })
    await engine.run()
    await engine.ensureCurrentBuildFinish()
    await engine.registerClient('delivery-test')

    return {
        engine,
        patches,
        async edit(module: 'first' | 'second', marker: string): Promise<PatchUpdate> {
            const previousCount = patches.length
            await publishSource(module === 'first' ? firstPath : secondPath, renderModule(marker))
            const startedAt = Date.now()
            while (patches.length === previousCount) {
                assert.deepEqual(failures, [])
                assert.ok(Date.now() - startedAt < 10_000, 'Timed out waiting for a Rolldown patch')
                await delay(10)
            }
            await engine.ensureCurrentBuildFinish()
            assert.deepEqual(failures, [])
            assert.equal(patches.length, previousCount + 1)
            return patches[previousCount]
        },
        async close(): Promise<void> {
            await engine.close()
            await server.close()
            await rm(root, { recursive: true })
        }
    }
}

for (const delivery of ['immediate', 'delayed'] as const) {
    test(`${delivery} delivery notifications do not make independent Rolldown patches cumulative`, async (context) => {
        const fixture = await createFixture()
        context.after(fixture.close)
        const first = await fixture.edit('first', 'first-updated')
        if (delivery === 'immediate') {
            await fixture.engine.notifyPayloadDelivered(first.filename)
        }
        const second = await fixture.edit('second', 'second-updated')
        assert.match(first.code, /first-updated/)
        assert.match(second.code, /second-updated/)
        assert.deepEqual([first.seq, second.seq], [1, 2])
        assert.notEqual(first.filename, second.filename)
        assert.doesNotMatch(second.code, /first-updated/)
        assert.equal(first.changedIds.length, 1)
        assert.equal(second.changedIds.length, 1)
        assert.notEqual(first.changedIds[0], second.changedIds[0])

        // Execute the native registration programs, not just string markers. Replacing patch 1 with patch 2 loses its value.
        const latestOnly = createBaseline(first.changedIds[0], second.changedIds[0])
        applyRegistration(latestOnly, second)
        assert.equal(readValue(latestOnly.loadExports(first.changedIds[0])), 'first-original')
        assert.equal(readValue(latestOnly.loadExports(second.changedIds[0])), 'second-updated')

        const retainedHistory = createBaseline(first.changedIds[0], second.changedIds[0])
        applyRegistration(retainedHistory, first)
        applyRegistration(retainedHistory, second)
        assert.equal(readValue(retainedHistory.loadExports(first.changedIds[0])), 'first-updated')
        assert.equal(readValue(retainedHistory.loadExports(second.changedIds[0])), 'second-updated')

        // Moving the notification to the latest runtime ACK does not turn the next generation into a history replay either.
        await fixture.engine.notifyPayloadDelivered(second.filename)
        const third = await fixture.edit('second', 'second-final')
        assert.equal(third.seq, 3)
        assert.doesNotMatch(third.code, /first-updated/)
        applyRegistration(latestOnly, third)
        assert.equal(readValue(latestOnly.loadExports(first.changedIds[0])), 'first-original')
        assert.equal(readValue(latestOnly.loadExports(second.changedIds[0])), 'second-final')
    })
}
