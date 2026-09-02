import assert from 'node:assert/strict'
import test from 'node:test'
import { DevRuntime } from 'rolldown/experimental/runtime'
import { runtimeReportEvent } from '../../hmr-protocol.ts'
import type { MiniSocketTask } from '../../mini-hmr-runtime.ts'

type TestHotContext = Readonly<{
    _internal: Readonly<{
        removeStyle: () => void
        updateStyle: () => void
    }>
    accept: (callback?: (moduleExports: unknown) => void) => void
    invalidate: (reason?: string) => never
    prune: (callback?: () => void) => void
    runAccept: (moduleExports: unknown) => void
}>

type TestPatch = Readonly<{
    seq: number
    changedIds: string[]
    factory: () => void
}>

type TestRuntime = DevRuntime &
    Readonly<{
        createModuleHotContext: (moduleId: string) => TestHotContext
        moduleHotContexts: ReadonlyMap<string, TestHotContext>
        initialize: (info: { buildId: string; endpoint: string }) => void
        applyPatches: (payload: { buildId: string; patches: TestPatch[] } | undefined) => void
        sendReport: (data: Record<string, unknown>) => void
        sendSocketEvent: (event: string, data: unknown) => void
        stopSocket: (reason: string) => void
    }>

type CapturedSocketMessage = Readonly<{
    type: 'custom'
    event: string
    data: unknown
}>

type TestHarness = Readonly<{
    emitSocketMessage: (data: string | ArrayBuffer) => void
    messages: CapturedSocketMessage[]
    reports: unknown[]
    runtime: TestRuntime
}>

// Mutable only to give every dynamic import an independent module identity and therefore a fresh runtime singleton.
let runtimeId = 0

/** Creates one isolated runtime and captures only its metadata reports. */
async function createTestHarness(): Promise<TestHarness> {
    // These mutable values capture socket output and the native message callback registered by one runtime.
    const reports: unknown[] = []
    const messages: CapturedSocketMessage[] = []
    let receiveSocketMessage = (_result: Readonly<{ data: string | ArrayBuffer }>) => {}
    const socket: MiniSocketTask = {
        send(options) {
            const envelope = JSON.parse(String(options.data)) as CapturedSocketMessage
            messages.push(envelope)
            if (envelope.event === runtimeReportEvent) {
                reports.push(envelope.data)
            }
        },
        close() {},
        onMessage(listener) {
            receiveSocketMessage = listener
        }
    }
    Object.assign(globalThis, {
        DevRuntime,
        __VPT_RUNTIME_GLOBAL__: globalThis,
        wx: {
            connectSocket(): MiniSocketTask {
                return socket
            }
        }
    })

    const runtime = await importTestRuntime()
    runtime.initialize({ buildId: 'build', endpoint: 'ws://localhost/hmr' })
    return {
        emitSocketMessage(data) {
            receiveSocketMessage({ data: data })
        },
        messages: messages,
        reports: reports,
        runtime: runtime
    }
}

async function importTestRuntime(): Promise<TestRuntime> {
    runtimeId++
    await import(`../../../../wx/dev/devtools-runtime.ts?test=${runtimeId}`)

    const runtime = (globalThis as typeof globalThis & { __rolldown_runtime__?: TestRuntime }).__rolldown_runtime__
    if (!runtime) throw new Error('Mini Program dev runtime was not installed')
    return runtime
}

function readValue(moduleExports: unknown): string {
    assert.ok(
        moduleExports &&
            typeof moduleExports === 'object' &&
            'value' in moduleExports &&
            typeof moduleExports.value === 'string'
    )
    return moduleExports.value
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

test('ignores socket frames outside the Vite custom-event protocol', async () => {
    const { emitSocketMessage, reports } = await createTestHarness()

    emitSocketMessage(new ArrayBuffer(0))
    emitSocketMessage(JSON.stringify({ type: 'connected' }))
    emitSocketMessage(JSON.stringify({ type: 'custom' }))
    emitSocketMessage(JSON.stringify({ type: 'custom', event: 'unrelated', data: 'ignored' }))

    assert.deepEqual(reports, [])
})

test('ignores the initial empty physical patch module', async () => {
    const { reports, runtime } = await createTestHarness()
    const reportCount = reports.length

    runtime.applyPatches(undefined)

    assert.deepEqual(getNewReports(reports, reportCount), [])
})

test('reports the committed application frontier through the exact host protocol', async () => {
    const { messages, runtime } = await createTestHarness()
    registerInitialModule({ runtime, moduleId: 'page', moduleExports: { value: 'old' } })

    runtime.applyPatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'page',
                moduleExports: { value: 'new' },
                deferAccept: false
            })
        ]
    })

    assert.deepEqual(messages, [
        {
            type: 'custom',
            event: runtimeReportEvent,
            data: { buildId: 'build', kind: 'applied', seq: 1 }
        }
    ])
})

test('keeps the first App-heap identity when initialize is replayed', async (context) => {
    context.mock.method(console, 'warn', () => {})
    const { messages, runtime } = await createTestHarness()
    runtime.initialize({ buildId: 'replacement', endpoint: 'ws://replacement/hmr' })
    registerInitialModule({ runtime, moduleId: 'page', moduleExports: { value: 'old' } })

    runtime.applyPatches({
        buildId: 'replacement',
        patches: [
            {
                seq: 1,
                changedIds: ['page'],
                factory(): void {
                    assert.fail('A replacement session must not execute in the existing App heap')
                }
            }
        ]
    })
    runtime.applyPatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'page',
                moduleExports: { value: 'current' },
                deferAccept: false
            })
        ]
    })

    assert.deepEqual(runtime.loadExports('page'), { value: 'current' })
    assert.equal(messages.length, 1)
    assert.deepEqual(messages[0]?.data, { buildId: 'build', kind: 'applied', seq: 1 })
})

test('retains hot contexts only after they become accepting boundaries', async () => {
    const { runtime } = await createTestHarness()
    const passiveContext = runtime.createModuleHotContext('passive')

    assert.equal(runtime.moduleHotContexts.has('passive'), false)

    passiveContext.accept()
    assert.equal(runtime.moduleHotContexts.get('passive'), passiveContext)

    runtime.createModuleHotContext('passive')
    assert.equal(runtime.moduleHotContexts.has('passive'), false)
})

test('fails invariant-only hot operations with local diagnostics', async () => {
    const { runtime } = await createTestHarness()
    const passiveContext: TestHotContext = runtime.createModuleHotContext('passive')

    assert.throws(() => passiveContext.runAccept({}), /passive hot context reached as boundary: passive/)
    assert.throws(() => passiveContext.invalidate(), /the accepting module invalidated the update/)
})

test('rejects reports before initialization', async () => {
    Object.assign(globalThis, {
        DevRuntime,
        __VPT_RUNTIME_GLOBAL__: globalThis,
        wx: {
            connectSocket(): never {
                assert.fail('An uninitialized runtime must not open a socket')
            }
        }
    })
    const uninitializedRuntime = await importTestRuntime()
    assert.throws(() => uninitializedRuntime.sendReport({ kind: 'applied', seq: 1 }), /runtime is not initialized/)
    assert.throws(() => uninitializedRuntime.sendSocketEvent('event', {}), /socket is not initialized/)
    assert.throws(() => uninitializedRuntime.stopSocket('stop'), /socket is not initialized/)
})

test('keeps generated CSS hot operations inert because WXSS is replaced physically', async () => {
    const { runtime } = await createTestHarness()
    const hotContext = runtime.createModuleHotContext('style.css')

    hotContext._internal.updateStyle()
    hotContext._internal.removeStyle()
    hotContext.prune(() => assert.fail('Physical WXSS replacement must not run browser teardown callbacks'))

    assert.equal(runtime.moduleHotContexts.has('style.css'), false)
})

test('runs every callback from the previous accepting generation in registration order', async () => {
    const { runtime } = await createTestHarness()
    // This mutable trace captures callback order while the new generation replaces the module cache.
    const accepted: unknown[] = []
    runtime.registerGraph({ ids: ['page'], localCount: 1, edges: [[]], dynamicEdges: [[]] })
    const hotContext: TestHotContext = runtime.createModuleHotContext('page')
    hotContext.accept()
    hotContext.accept((fresh) => accepted.push(['first', fresh]))
    hotContext.accept((fresh) => accepted.push(['second', fresh]))
    runtime.registerModule('page', { exports: { value: 'old' } })

    runtime.applyPatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'page',
                moduleExports: { value: 'new' },
                deferAccept: false
            })
        ]
    })

    assert.deepEqual(accepted, [
        ['first', { value: 'new' }],
        ['second', { value: 'new' }]
    ])
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

    runtime.applyPatches({
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

    runtime.applyPatches({
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

    runtime.applyPatches({
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

    runtime.applyPatches({ buildId: 'build', patches })

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

    runtime.applyPatches({
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
    runtime.applyPatches({ buildId: 'build', patches: [firstPatch] })
    const reportCount = reports.length

    runtime.applyPatches({
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

test('re-reports the committed frontier when another Page shell replays the complete patch file', async () => {
    const { reports, runtime } = await createTestHarness()
    registerInitialModule({ runtime, moduleId: 'page', moduleExports: { value: 'old' } })
    runtime.applyPatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'page',
                moduleExports: { value: 'current' },
                deferAccept: false
            })
        ]
    })
    const reportCount = reports.length

    runtime.applyPatches({
        buildId: 'build',
        patches: [
            {
                seq: 1,
                changedIds: ['page'],
                factory(): void {
                    assert.fail('A fully replayed physical patch file must not execute factories')
                }
            }
        ]
    })

    assert.deepEqual(runtime.loadExports('page'), { value: 'current' })
    assert.deepEqual(getNewReports(reports, reportCount), [{ buildId: 'build', kind: 'applied', seq: 1 }])
})

test('detects a sequence gap after skipping a replayed physical prefix', async (context) => {
    context.mock.method(console, 'warn', () => {})
    const { reports, runtime } = await createTestHarness()
    // The replayed prefix must be ignored, while the later incremental factory must be rejected because sequence 2 is absent.
    let laterFactoryRuns = 0
    registerInitialModule({ runtime, moduleId: 'page', moduleExports: { value: 'old' } })
    runtime.applyPatches({
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

    runtime.applyPatches({
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

    runtime.applyPatches({
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

    runtime.applyPatches({
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

test('stringifies non-Error patch failures in rebuild reports', async (context) => {
    context.mock.method(console, 'warn', () => {})
    const { reports, runtime } = await createTestHarness()
    const failure = Object.freeze({ reason: 'non-error failure' })

    runtime.applyPatches({
        buildId: 'build',
        patches: [
            {
                seq: 1,
                changedIds: [],
                factory(): void {
                    throw failure
                }
            }
        ]
    })

    assert.match(JSON.stringify(reports), /"kind":"rebuild"/)
    assert.match(JSON.stringify(reports), /\[object Object\]/)
})

test('turns boundary invalidation directly into a rebuild', async (context) => {
    context.mock.method(console, 'warn', () => {})
    const { reports, runtime } = await createTestHarness()
    runtime.registerGraph({ ids: ['page'], localCount: 1, edges: [[]], dynamicEdges: [[]] })
    const hotContext = runtime.createModuleHotContext('page')
    hotContext.accept(() => hotContext.invalidate('incompatible boundary'))
    runtime.registerModule('page', { exports: { value: 'old' } })
    const reportCount = reports.length

    runtime.applyPatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'page',
                moduleExports: { value: 'new' },
                deferAccept: false
            })
        ]
    })

    const newReports = getNewReports(reports, reportCount)
    assert.match(JSON.stringify(newReports), /"kind":"rebuild"/)
    assert.match(JSON.stringify(newReports), /incompatible boundary/)
    assert.doesNotMatch(JSON.stringify(newReports), /"kind":"applied"/)
})

test('ignores patches for a stale build before running their factories', async (context) => {
    context.mock.method(console, 'warn', () => {})
    const { reports, runtime } = await createTestHarness()
    // Detects any stale factory execution before the build identity guard.
    let factoryRuns = 0
    registerInitialModule({ runtime, moduleId: 'page', moduleExports: { value: 'old' } })
    const reportCount = reports.length

    runtime.applyPatches({
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

test('bubbles a dependency update to the nearest accepting importer', async () => {
    const { reports, runtime } = await createTestHarness()
    runtime.registerGraph({
        ids: ['page', 'dependency'],
        localCount: 2,
        edges: [[1], []],
        dynamicEdges: [[], []]
    })
    runtime.registerModule('dependency', { exports: { value: 'old dependency' } })
    runtime.registerModule('page', { exports: { value: 'page:old dependency' } })

    // The previous Page generation records the fresh aggregate received at its HMR boundary.
    let acceptedExports: unknown
    const pageHotContext: TestHotContext = runtime.createModuleHotContext('page')
    pageHotContext.accept((fresh) => {
        acceptedExports = fresh
    })
    const reportCount = reports.length

    runtime.applyPatches({
        buildId: 'build',
        patches: [
            {
                seq: 1,
                changedIds: ['dependency'],
                factory() {
                    runtime.registerGraph({
                        ids: ['page', 'dependency'],
                        localCount: 2,
                        edges: [[1], []],
                        dynamicEdges: [[], []]
                    })
                    runtime.registerFactory('dependency', 'esm', (id) => {
                        runtime.registerModule(id, { exports: { value: 'new dependency' } })
                    })
                    runtime.registerFactory('page', 'esm', (id) => {
                        const dependencyExports: unknown = runtime.initModule('dependency')
                        assert.ok(
                            dependencyExports &&
                                typeof dependencyExports === 'object' &&
                                'value' in dependencyExports &&
                                typeof dependencyExports.value === 'string'
                        )
                        runtime.registerModule(id, { exports: { value: `page:${dependencyExports.value}` } })
                        runtime.createModuleHotContext(id).accept()
                    })
                }
            }
        ]
    })

    assert.deepEqual(acceptedExports, { value: 'page:new dependency' })
    assert.deepEqual(runtime.loadExports('page'), { value: 'page:new dependency' })
    const newReports = getNewReports(reports, reportCount)
    assertApplied(newReports, 1)
    assertNoRebuild(newReports)
})

test('applies a converging dependency graph once at its shared accepting boundary', async () => {
    const { reports, runtime } = await createTestHarness()
    const graph = {
        ids: ['boundary', 'left', 'right', 'dependency'],
        localCount: 4,
        edges: [[1, 2], [3], [3], []],
        dynamicEdges: [[], [], [], []]
    }
    runtime.registerGraph(graph)
    runtime.registerModule('dependency', { exports: { value: 'old' } })
    runtime.registerModule('left', { exports: { value: 'left:old' } })
    runtime.registerModule('right', { exports: { value: 'right:old' } })
    runtime.registerModule('boundary', { exports: { value: 'boundary:old' } })
    // These mutable counters prove converging importer paths do not execute shared modules or boundaries twice.
    const executions = new Map<string, number>()
    const countExecution = (moduleId: string): void => {
        executions.set(moduleId, (executions.get(moduleId) ?? 0) + 1)
    }
    // This mutable observation retains the one fresh namespace delivered to the previous accepting generation.
    let acceptedExports: unknown
    const boundaryHotContext: TestHotContext = runtime.createModuleHotContext('boundary')
    boundaryHotContext.accept((fresh) => {
        acceptedExports = fresh
    })
    const reportCount = reports.length

    runtime.applyPatches({
        buildId: 'build',
        patches: [
            {
                seq: 1,
                changedIds: ['dependency'],
                factory(): void {
                    runtime.registerGraph(graph)
                    runtime.registerFactory('dependency', 'esm', (id) => {
                        countExecution(id)
                        runtime.registerModule(id, { exports: { value: 'new' } })
                    })
                    runtime.registerFactory('left', 'esm', (id) => {
                        countExecution(id)
                        const dependency = runtime.initModule('dependency')
                        runtime.registerModule(id, { exports: { value: `left:${readValue(dependency)}` } })
                    })
                    runtime.registerFactory('right', 'esm', (id) => {
                        countExecution(id)
                        const dependency = runtime.initModule('dependency')
                        runtime.registerModule(id, { exports: { value: `right:${readValue(dependency)}` } })
                    })
                    runtime.registerFactory('boundary', 'esm', (id) => {
                        countExecution(id)
                        const left = runtime.initModule('left')
                        const right = runtime.initModule('right')
                        runtime.registerModule(id, {
                            exports: { value: `${readValue(left)}|${readValue(right)}` }
                        })
                        runtime.createModuleHotContext(id).accept()
                    })
                }
            }
        ]
    })

    assert.deepEqual(acceptedExports, { value: 'left:new|right:new' })
    assert.deepEqual(Object.fromEntries(executions), {
        boundary: 1,
        left: 1,
        dependency: 1,
        right: 1
    })
    assertApplied(getNewReports(reports, reportCount), 1)
    assertNoRebuild(getNewReports(reports, reportCount))
})

test('requests a rebuild before eviction when any propagated module lacks a fresh factory', async (context) => {
    context.mock.method(console, 'warn', () => {})
    const { reports, runtime } = await createTestHarness()
    const graph = {
        ids: ['page', 'dependency'],
        localCount: 2,
        edges: [[1], []],
        dynamicEdges: [[], []]
    }
    runtime.registerGraph(graph)
    runtime.registerModule('dependency', { exports: { value: 'old dependency' } })
    runtime.registerModule('page', { exports: { value: 'old page' } })
    runtime.createModuleHotContext('page').accept()
    const reportCount = reports.length

    runtime.applyPatches({
        buildId: 'build',
        patches: [
            {
                seq: 1,
                changedIds: ['dependency'],
                factory(): void {
                    runtime.registerGraph(graph)
                    runtime.registerFactory('dependency', 'esm', (id) => {
                        runtime.registerModule(id, { exports: { value: 'new dependency' } })
                    })
                }
            }
        ]
    })

    assert.deepEqual(runtime.loadExports('dependency'), { value: 'old dependency' })
    assert.deepEqual(runtime.loadExports('page'), { value: 'old page' })
    const newReports = getNewReports(reports, reportCount)
    assert.match(JSON.stringify(newReports), /no HMR factory for module page/)
    assert.doesNotMatch(JSON.stringify(newReports), /"kind":"applied"/)
})

test('requests a rebuild for circular propagation without an accepting boundary', async (context) => {
    context.mock.method(console, 'warn', () => {})
    const { reports, runtime } = await createTestHarness()
    const graph = {
        ids: ['a', 'b'],
        localCount: 2,
        edges: [[1], [0]],
        dynamicEdges: [[], []]
    }
    runtime.registerGraph(graph)
    runtime.registerModule('a', { exports: { value: 'old a' } })
    runtime.registerModule('b', { exports: { value: 'old b' } })
    const reportCount = reports.length

    runtime.applyPatches({
        buildId: 'build',
        patches: [
            {
                seq: 1,
                changedIds: ['a'],
                factory(): void {
                    runtime.registerGraph(graph)
                    runtime.registerFactory('a', 'esm', (id) => {
                        runtime.registerModule(id, { exports: { value: 'new a' } })
                    })
                    runtime.registerFactory('b', 'esm', (id) => {
                        runtime.registerModule(id, { exports: { value: 'new b' } })
                    })
                }
            }
        ]
    })

    assert.deepEqual(runtime.loadExports('a'), { value: 'old a' })
    assert.deepEqual(runtime.loadExports('b'), { value: 'old b' })
    const newReports = getNewReports(reports, reportCount)
    assert.match(JSON.stringify(newReports), /circular HMR propagation between/)
    assert.doesNotMatch(JSON.stringify(newReports), /"kind":"applied"/)
})

test('requests a rebuild when an executed graph has no accepting boundary', async (context) => {
    context.mock.method(console, 'warn', () => {})
    const { reports, runtime } = await createTestHarness()
    runtime.registerGraph({ ids: ['page'], localCount: 1, edges: [[]], dynamicEdges: [[]] })
    runtime.registerModule('page', { exports: { value: 'still live' } })
    const reportCount = reports.length

    runtime.applyPatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'page',
                moduleExports: { value: 'must not execute' },
                deferAccept: false
            })
        ]
    })

    assert.deepEqual(runtime.loadExports('page'), { value: 'still live' })
    const newReports = getNewReports(reports, reportCount)
    assert.match(JSON.stringify(newReports), /no HMR boundary found for module page/)
    assert.doesNotMatch(JSON.stringify(newReports), /"kind":"applied"/)
})

test('defers a patch for an unloaded lazy module until its first import', async () => {
    const { reports, runtime } = await createTestHarness()
    // Execution is observed separately from factory publication to prove the lazy boundary remains cold.
    let moduleExecutions = 0
    const reportCount = reports.length

    runtime.applyPatches({
        buildId: 'build',
        patches: [
            createPatch({
                runtime,
                seq: 1,
                moduleId: 'lazy-feature',
                moduleExports: { value: 'latest lazy feature' },
                deferAccept: false,
                onExecute: () => {
                    moduleExecutions++
                }
            })
        ]
    })

    assert.equal(moduleExecutions, 0)
    const newReports = getNewReports(reports, reportCount)
    assertApplied(newReports, 1)
    assertNoRebuild(newReports)

    assert.deepEqual(runtime.initModule('lazy-feature'), { value: 'latest lazy feature' })
    assert.equal(moduleExecutions, 1)
})
