import assert from 'node:assert/strict'
import test from 'node:test'
import { DevRuntime } from 'rolldown/experimental/runtime'

type TestHotContext = Readonly<{
    accept: (callback?: (moduleExports: unknown) => void) => void
}>

type TestPatch = Readonly<{
    seq: number
    changedIds: string[]
    factory: () => void
}>

type TestRuntime = DevRuntime &
    Readonly<{
        createModuleHotContext: (moduleId: string) => TestHotContext
        initialize: (info: { buildId: string; endpoint: string }) => void
        storePatches: (payload: { buildId: string; patches: TestPatch[] }) => void
    }>

type TestHarness = Readonly<{
    reports: unknown[]
    runtime: TestRuntime
}>

// Mutable only to give every dynamic import an independent module identity and therefore a fresh runtime singleton.
let runtimeId = 0

/** Creates one isolated runtime and captures only its metadata reports. */
async function createTestHarness(): Promise<TestHarness> {
    const reports: unknown[] = []
    Object.assign(globalThis, {
        DevRuntime,
        wx: {
            request(options: { data: unknown; success: () => void }): void {
                reports.push(options.data)
                options.success()
            }
        }
    })

    runtimeId++
    await import(`./dev-runtime.ts?test=${runtimeId}`)

    const runtime = (globalThis as typeof globalThis & { __rolldown_runtime__?: TestRuntime }).__rolldown_runtime__
    if (!runtime) throw new Error('WX dev runtime was not installed')
    runtime.initialize({ buildId: 'build', endpoint: 'http://localhost/hmr' })
    return { reports, runtime }
}

function registerInitialModule({
    runtime,
    moduleId,
    moduleExports,
    callback
}: {
    runtime: TestRuntime
    moduleId: string
    moduleExports: unknown
    callback?: (fresh: unknown) => void
}): void {
    runtime.registerGraph({ ids: [moduleId], localCount: 1, edges: [[]], dynamicEdges: [[]] })
    const hotContext = runtime.createModuleHotContext(moduleId)
    hotContext.accept(callback)
    runtime.registerModule(moduleId, { exports: moduleExports })
}

function createPatch({
    runtime,
    seq,
    moduleId,
    moduleExports,
    deferAccept,
    onRegister,
    onExecute
}: {
    runtime: TestRuntime
    seq: number
    moduleId: string
    moduleExports: unknown
    deferAccept: boolean
    onRegister?: () => void
    onExecute?: () => void
}): TestPatch {
    return {
        seq,
        changedIds: [moduleId],
        factory(): void {
            onRegister?.()
            runtime.registerGraph({ ids: [moduleId], localCount: 1, edges: [[]], dynamicEdges: [[]] })
            runtime.registerFactory(moduleId, 'esm', (id) => {
                onExecute?.()
                runtime.registerModule(id, { exports: moduleExports })
                const hotContext = runtime.createModuleHotContext(id)
                if (deferAccept) {
                    queueMicrotask(() => hotContext.accept())
                } else {
                    hotContext.accept()
                }
            })
        }
    }
}

function getNewReports(reports: readonly unknown[], previousCount: number): readonly unknown[] {
    return reports.slice(previousCount)
}

function assertNoRebuild(reports: readonly unknown[]): void {
    assert.doesNotMatch(JSON.stringify(reports), /"kind":"rebuild"/)
}

function assertApplied(reports: readonly unknown[], seq: number): void {
    assert.match(JSON.stringify(reports), new RegExp(`"kind":"applied","seq":${seq}`))
}

test('initialization does not report an application frontier before patches run', async () => {
    const { reports } = await createTestHarness()
    assert.deepEqual(reports, [])
})

test('evicts an accepted module before running its new factory', async () => {
    const { reports, runtime } = await createTestHarness()
    // Written by the old generation's accept callback; it must observe the new exports.
    let acceptedExports: unknown
    registerInitialModule({
        runtime,
        moduleId: 'accepted',
        moduleExports: { value: 'old' },
        callback: (fresh) => {
            acceptedExports = fresh
        }
    })
    const reportCount = reports.length

    runtime.storePatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'accepted',
                moduleExports: { value: 'new' },
                deferAccept: false
            })
        ]
    })

    assert.deepEqual(acceptedExports, { value: 'new' })
    assert.deepEqual(runtime.loadExports('accepted'), { value: 'new' })
    const newReports = getNewReports(reports, reportCount)
    assertApplied(newReports, 1)
    assertNoRebuild(newReports)
})

test('treats a bare accept as a self-accepting boundary', async () => {
    const { reports, runtime } = await createTestHarness()
    registerInitialModule({ runtime, moduleId: 'bare', moduleExports: { value: 'old' } })
    const reportCount = reports.length

    runtime.storePatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'bare',
                moduleExports: { value: 'new' },
                deferAccept: false
            })
        ]
    })

    assert.deepEqual(runtime.loadExports('bare'), { value: 'new' })
    assertNoRebuild(getNewReports(reports, reportCount))
})

test('coalesces consecutive patches before deferred accept registration', async () => {
    const { reports, runtime } = await createTestHarness()
    // Captures the one export generation and invocation delivered to the previous hot context.
    let acceptedExports: unknown
    let acceptCalls = 0
    registerInitialModule({
        runtime,
        moduleId: 'page',
        moduleExports: { value: 'old' },
        callback: (fresh) => {
            acceptedExports = fresh
            acceptCalls++
        }
    })
    const reportCount = reports.length

    runtime.storePatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'page',
                moduleExports: { value: 'intermediate' },
                deferAccept: true
            }),
            createPatch({
                runtime,
                seq: 2,
                moduleId: 'page',
                moduleExports: { value: 'latest' },
                deferAccept: true
            })
        ]
    })

    assert.equal(acceptCalls, 1)
    assert.deepEqual(acceptedExports, { value: 'latest' })
    assert.deepEqual(runtime.loadExports('page'), { value: 'latest' })
    assertNoRebuild(getNewReports(reports, reportCount))
})

test('coalesces a burst of deferred React Refresh patches into its latest generation', async () => {
    const { reports, runtime } = await createTestHarness()
    // Separately records registry programs and application module executions across the burst.
    let factoryRuns = 0
    let moduleExecutions = 0
    registerInitialModule({ runtime, moduleId: 'page', moduleExports: { value: 0 } })
    const reportCount = reports.length
    const patches = Array.from({ length: 20 }, (_, index) =>
        createPatch({
            runtime,
            seq: index + 1,
            moduleId: 'page',
            moduleExports: { value: index + 1 },
            deferAccept: true,
            onRegister: () => {
                factoryRuns++
            },
            onExecute: () => {
                moduleExecutions++
            }
        })
    )

    runtime.storePatches({ buildId: 'build', patches })

    assert.equal(factoryRuns, 20)
    assert.equal(moduleExecutions, 1)
    assert.deepEqual(runtime.loadExports('page'), { value: 20 })
    const newReports = getNewReports(reports, reportCount)
    assertApplied(newReports, 20)
    assertNoRebuild(newReports)
})

test('unions changed modules from separate patches into one apply', async () => {
    const { reports, runtime } = await createTestHarness()
    // Each callback records the final exports observed at its independent accepting boundary.
    let acceptedA: unknown
    let acceptedB: unknown
    registerInitialModule({
        runtime,
        moduleId: 'a',
        moduleExports: { value: 'old-a' },
        callback: (fresh) => {
            acceptedA = fresh
        }
    })
    registerInitialModule({
        runtime,
        moduleId: 'b',
        moduleExports: { value: 'old-b' },
        callback: (fresh) => {
            acceptedB = fresh
        }
    })
    const reportCount = reports.length

    runtime.storePatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'a',
                moduleExports: { value: 'new-a' },
                deferAccept: true
            }),
            createPatch({
                runtime,
                seq: 2,
                moduleId: 'b',
                moduleExports: { value: 'new-b' },
                deferAccept: true
            })
        ]
    })

    assert.deepEqual(acceptedA, { value: 'new-a' })
    assert.deepEqual(acceptedB, { value: 'new-b' })
    assertNoRebuild(getNewReports(reports, reportCount))
})

test('ignores a cumulative payload prefix already applied by another Page shell', async () => {
    const { reports, runtime } = await createTestHarness()
    // Replayed factories throw if the runtime fails to discard the old physical prefix.
    let latestFactoryRuns = 0
    registerInitialModule({ runtime, moduleId: 'page', moduleExports: { value: 'old' } })
    const firstPatch = createPatch({
        runtime,
        seq: 1,
        moduleId: 'page',
        moduleExports: { value: 'first' },
        deferAccept: false
    })
    runtime.storePatches({ buildId: 'build', patches: [firstPatch] })
    const reportCount = reports.length

    runtime.storePatches({
        buildId: 'build',
        patches: [
            {
                seq: 1,
                changedIds: ['page'],
                factory(): void {
                    throw new Error('replayed factory executed')
                }
            },
            createPatch({
                runtime,
                seq: 2,
                moduleId: 'page',
                moduleExports: { value: 'latest' },
                deferAccept: false,
                onRegister: () => {
                    latestFactoryRuns++
                }
            })
        ]
    })

    assert.equal(latestFactoryRuns, 1)
    assert.deepEqual(runtime.loadExports('page'), { value: 'latest' })
    assertNoRebuild(getNewReports(reports, reportCount))
})

test('detects a sequence gap after skipping a replayed physical prefix', async (context) => {
    context.mock.method(console, 'warn', () => {})
    const { reports, runtime } = await createTestHarness()
    // The replayed prefix must be ignored, while the later incremental factory must be rejected because sequence 2 is absent.
    let laterFactoryRuns = 0
    registerInitialModule({ runtime, moduleId: 'page', moduleExports: { value: 'old' } })
    runtime.storePatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'page',
                moduleExports: { value: 'first' },
                deferAccept: false
            })
        ]
    })
    const reportCount = reports.length

    runtime.storePatches({
        buildId: 'build',
        patches: [
            {
                seq: 1,
                changedIds: ['page'],
                factory(): void {
                    throw new Error('replayed factory executed')
                }
            },
            createPatch({
                runtime,
                seq: 3,
                moduleId: 'page',
                moduleExports: { value: 'invalid' },
                deferAccept: false,
                onRegister: () => {
                    laterFactoryRuns++
                }
            })
        ]
    })

    const newReports = getNewReports(reports, reportCount)
    assert.equal(laterFactoryRuns, 0)
    assert.deepEqual(runtime.loadExports('page'), { value: 'first' })
    assert.match(JSON.stringify(newReports), /"kind":"rebuild"/)
    assert.match(JSON.stringify(newReports), /missing patch sequence 2/)
})

test('requests a rebuild before mutating registries when a sequence is missing', async (context) => {
    context.mock.method(console, 'warn', () => {})
    const { reports, runtime } = await createTestHarness()
    // Proves the invalid patch factory is rejected before it can mutate Rolldown's registries.
    let factoryRuns = 0
    registerInitialModule({ runtime, moduleId: 'page', moduleExports: { value: 'old' } })
    const reportCount = reports.length

    runtime.storePatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 2,
                moduleId: 'page',
                moduleExports: { value: 'invalid' },
                deferAccept: false,
                onRegister: () => {
                    factoryRuns++
                }
            })
        ]
    })

    const newReports = getNewReports(reports, reportCount)
    assert.equal(factoryRuns, 0)
    assert.deepEqual(runtime.loadExports('page'), { value: 'old' })
    assert.match(JSON.stringify(newReports), /"kind":"rebuild"/)
    assert.doesNotMatch(JSON.stringify(newReports), /"kind":"applied"/)
    assert.match(JSON.stringify(newReports), /missing patch sequence 1/)
})

test('rejects a duplicate new sequence instead of treating it as a replay', async (context) => {
    context.mock.method(console, 'warn', () => {})
    const { reports, runtime } = await createTestHarness()
    // Only the first duplicate may register; the batch must fail before any application module executes.
    let firstFactoryRuns = 0
    let duplicateFactoryRuns = 0
    registerInitialModule({ runtime, moduleId: 'page', moduleExports: { value: 'old' } })
    const reportCount = reports.length

    runtime.storePatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'page',
                moduleExports: { value: 'first' },
                deferAccept: false,
                onRegister: () => {
                    firstFactoryRuns++
                }
            }),
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'page',
                moduleExports: { value: 'duplicate' },
                deferAccept: false,
                onRegister: () => {
                    duplicateFactoryRuns++
                }
            })
        ]
    })

    const newReports = getNewReports(reports, reportCount)
    assert.equal(firstFactoryRuns, 1)
    assert.equal(duplicateFactoryRuns, 0)
    assert.deepEqual(runtime.loadExports('page'), { value: 'old' })
    assert.match(JSON.stringify(newReports), /"kind":"rebuild"/)
    assert.match(JSON.stringify(newReports), /missing patch sequence 2/)
})

test('ignores patches for a stale build before running their factories', async (context) => {
    context.mock.method(console, 'warn', () => {})
    const { reports, runtime } = await createTestHarness()
    // Detects any stale factory execution before the build identity guard.
    let factoryRuns = 0
    registerInitialModule({ runtime, moduleId: 'page', moduleExports: { value: 'old' } })
    const reportCount = reports.length

    runtime.storePatches({
        buildId: 'stale-build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'page',
                moduleExports: { value: 'stale' },
                deferAccept: false,
                onRegister: () => {
                    factoryRuns++
                }
            })
        ]
    })

    assert.equal(factoryRuns, 0)
    assert.deepEqual(runtime.loadExports('page'), { value: 'old' })
    assert.deepEqual(getNewReports(reports, reportCount), [])
})
