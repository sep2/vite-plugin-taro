import assert from 'node:assert/strict'
import test from 'node:test'
import type { DevRuntime } from 'rolldown/experimental/runtime'
import { type RuntimeControlMessage, runtimeControlEvent, runtimeReportEvent } from '../../hmr-protocol.ts'
import type { MiniSocketTask } from '../../mini-hmr-runtime.ts'
import { type InterpreterServerMessage, interpreterServerEvent } from './interpreter-protocol.ts'

type TestHotContext = Readonly<{
    accept: (callback?: (moduleExports: unknown) => void) => void
}>

type TestRuntime = DevRuntime &
    Readonly<{
        createModuleHotContext: (moduleId: string) => TestHotContext
        initialize: (info: { buildId: string; endpoint: string }) => void
    }>

type ConnectOptions = Readonly<{
    url: string
    protocols: readonly string[]
}>

type CapturedSocket = MiniSocketTask &
    Readonly<{
        connectOptions: ConnectOptions
        closed: Array<Readonly<{ code: number; reason: string }>>
        emitMessage: (message: InterpreterServerMessage) => void
        emitControl: (message: RuntimeControlMessage) => void
        emitEvent: (event: string, data: unknown) => void
    }>

type TestHarness = Readonly<{
    reports: unknown[]
    runtime: TestRuntime
    sockets: CapturedSocket[]
}>

// Mutable only to give every dynamic import an independent module identity and therefore a fresh interpreter singleton.
let runtimeId = 0

function createSocket(connectOptions: ConnectOptions, reports: unknown[]): CapturedSocket {
    // These mutable listeners model native SocketTask messages and immediate close notifications from the platform API.
    let messageListener = (_result: Readonly<{ data: string | ArrayBuffer }>) => {}
    let closeListener = () => {}
    const closed: Array<Readonly<{ code: number; reason: string }>> = []

    return {
        connectOptions: connectOptions,
        closed: closed,
        send(options) {
            const envelope = JSON.parse(String(options.data)) as Readonly<{ event: string; data: unknown }>
            if (envelope.event === runtimeReportEvent) {
                reports.push(envelope.data)
            }
        },
        close(options) {
            closed.push(options)
            closeListener()
        },
        onOpen(listener) {
            listener()
        },
        onClose(listener) {
            closeListener = listener
        },
        onError() {},
        onMessage(listener) {
            messageListener = listener
        },
        emitMessage(message) {
            messageListener({
                data: JSON.stringify({ type: 'custom', event: interpreterServerEvent, data: message })
            })
        },
        emitControl(message) {
            messageListener({
                data: JSON.stringify({ type: 'custom', event: runtimeControlEvent, data: message })
            })
        },
        emitEvent(event, data) {
            messageListener({ data: JSON.stringify({ type: 'custom', event: event, data: data }) })
        }
    }
}

async function createTestHarness(): Promise<TestHarness> {
    // These mutable lists capture native network effects from one isolated runtime instance.
    const reports: unknown[] = []
    const sockets: CapturedSocket[] = []
    Object.assign(globalThis, {
        wx: {
            connectSocket(options: ConnectOptions): CapturedSocket {
                const socket = createSocket(options, reports)
                sockets.push(socket)
                return socket
            }
        }
    })

    runtimeId++
    await import(`../../../../wx/dev/interpreter-runtime.ts?test=${runtimeId}`)
    const runtime = (globalThis as typeof globalThis & { __rolldown_runtime__?: TestRuntime }).__rolldown_runtime__
    if (!runtime) throw new Error('Mini Program interpreter runtime was not installed')

    runtime.initialize({
        buildId: 'build',
        endpoint: 'ws://localhost/__vpt_hmr__?token=test'
    })
    // Startup synchronization is tested by the shared runtime lifecycle regressions; these assertions focus on interpretation.
    reports.length = 0
    return { reports: reports, runtime: runtime, sockets: sockets }
}

function registerInitialBoundary(runtime: TestRuntime, callback: (moduleExports: unknown) => void): void {
    runtime.registerGraph({ ids: ['page'], localCount: 1, edges: [[]], dynamicEdges: [[]] })
    runtime.registerModule('page', { exports: { value: 'old' } })
    runtime.createModuleHotContext('page').accept(callback)
}

const interpretedCode = `
__rolldown_runtime__.registerGraph({ ids: ['page'], localCount: 1, edges: [[]], dynamicEdges: [[]] });
__rolldown_runtime__.registerFactory('page', 'esm', function (moduleId) {
    __rolldown_runtime__.registerModule(moduleId, { exports: { value: 'interpreted' } });
    __rolldown_runtime__.createModuleHotContext(moduleId).accept();
});
`

test('interprets cumulative source and reports its application frontier', async () => {
    const { reports, runtime, sockets } = await createTestHarness()
    // This mutable cell captures the fresh boundary exports passed by the shared graph application transaction.
    let acceptedExports: unknown
    registerInitialBoundary(runtime, (moduleExports) => {
        acceptedExports = moduleExports
    })

    const socket = sockets[0]
    assert.ok(socket)
    assert.equal(socket.connectOptions.url, 'ws://localhost/__vpt_hmr__?token=test')
    assert.deepEqual(socket.connectOptions.protocols, ['vite-hmr'])

    socket.emitMessage({
        kind: 'patches',
        buildId: 'build',
        patches: [{ seq: 1, changedIds: ['page'], code: interpretedCode }]
    })

    assert.deepEqual(acceptedExports, { value: 'interpreted' })
    assert.deepEqual(runtime.loadExports('page'), { value: 'interpreted' })
    assert.deepEqual(reports, [{ buildId: 'build', kind: 'applied', seq: 1 }])
    assert.equal(sockets.length, 1)
})

test('reads live app globals while retaining patch-local bindings outside the host global', async (context) => {
    const { reports, runtime, sockets } = await createTestHarness()
    registerInitialBoundary(runtime, () => {})

    // Install a host API after the interpreter exists, just as ordinary app-startup polyfill imports do.
    Reflect.set(globalThis, '__vpt_late_api__', () => 'installed')
    context.after(() => {
        Reflect.deleteProperty(globalThis, '__vpt_late_api__')
        Reflect.deleteProperty(globalThis, '__vpt_patch_local__')
    })

    const socket = sockets[0]
    assert.ok(socket)
    socket.emitMessage({
        kind: 'patches',
        buildId: 'build',
        patches: [
            {
                seq: 1,
                changedIds: ['page'],
                code: `
                var __vpt_patch_local__ = __vpt_late_api__();
                __rolldown_runtime__.registerFactory('page', 'esm', function(moduleId) {
                    __rolldown_runtime__.registerModule(moduleId, { exports: {
                        value: __vpt_patch_local__,
                        host: globalThis,
                        microtask: queueMicrotask === globalThis.queueMicrotask
                    } });
                    __rolldown_runtime__.createModuleHotContext(moduleId).accept();
                });
            `
            }
        ]
    })

    assert.deepEqual(runtime.loadExports('page'), { value: 'installed', host: globalThis, microtask: true })
    assert.equal(Object.hasOwn(globalThis, '__vpt_patch_local__'), false)
    assert.deepEqual(reports, [{ buildId: 'build', kind: 'applied', seq: 1 }])
})

for (const ambient of ['undefined', 'another runtime'] as const) {
    test(`interpreted patches retain their caller when the host runtime binding is ${ambient}`, async (context) => {
        const first = await createTestHarness()
        const second = await createTestHarness()
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__rolldown_runtime__')
        assert.ok(descriptor)
        context.after(() => Object.defineProperty(globalThis, '__rolldown_runtime__', descriptor))
        if (ambient === 'undefined') {
            // Sval creates a non-configurable but writable host slot. Clear its value to test interpreter-local lookup.
            assert.equal(Reflect.set(globalThis, '__rolldown_runtime__', undefined), true)
        }
        const before = Object.getOwnPropertyDescriptor(globalThis, '__rolldown_runtime__')
        for (const harness of [first, second]) {
            registerInitialBoundary(harness.runtime, () => {})
            const socket = harness.sockets[0]
            assert.ok(socket)
            socket.emitMessage({
                kind: 'patches',
                buildId: 'build',
                patches: [
                    {
                        seq: 1,
                        changedIds: ['page'],
                        code: `
                        __rolldown_runtime__.registerFactory('page', 'esm', function(moduleId) {
                            __rolldown_runtime__.registerModule(moduleId, { exports: {
                                readRuntime: () => __rolldown_runtime__
                            } });
                            __rolldown_runtime__.createModuleHotContext(moduleId).accept();
                        });
                    `
                    }
                ]
            })
            assert.deepEqual(harness.reports, [{ buildId: 'build', kind: 'applied', seq: 1 }])
        }
        // Read after both wrappers have finished to detect global lookup or one shared mutable interpreter binding.
        for (const { runtime } of [first, second]) {
            runtime.removeModuleCache('page')
            const exports: unknown = runtime.initModule('page')
            assert.ok(exports && typeof exports === 'object' && 'readRuntime' in exports)
            assert.ok(typeof exports.readRuntime === 'function')
            assert.strictEqual(exports.readRuntime(), runtime)
        }
        assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, '__rolldown_runtime__'), before)
    })
}

test('ignores unrelated events and stops stale-build source without interpreting it', async () => {
    const { reports, sockets } = await createTestHarness()
    const socket = sockets[0]
    assert.ok(socket)

    socket.emitEvent('unrelated', {})
    assert.deepEqual(socket.closed, [])

    socket.emitMessage({
        kind: 'patches',
        buildId: 'stale-build',
        patches: [{ seq: 1, changedIds: ['page'], code: "throw new Error('must not run')" }]
    })

    assert.deepEqual(reports, [])
    assert.deepEqual(socket.closed, [{ code: 1000, reason: 'patch application stopped' }])
})

test('stops the socket after interpreter failure and requests a complete build', async (context) => {
    const warn = context.mock.method(console, 'warn', () => {})
    const { reports, runtime, sockets } = await createTestHarness()
    registerInitialBoundary(runtime, () => {})

    const socket = sockets[0]
    assert.ok(socket)
    socket.emitMessage({
        kind: 'patches',
        buildId: 'build',
        patches: [{ seq: 1, changedIds: ['page'], code: "throw new Error('broken program')" }]
    })

    // A late message must not install factories after shared failure handling has stopped this socket.
    socket.emitMessage({
        kind: 'patches',
        buildId: 'build',
        patches: [{ seq: 1, changedIds: ['page'], code: interpretedCode }]
    })
    assert.deepEqual(reports, [{ buildId: 'build', kind: 'rebuild', reason: 'broken program' }])
    assert.deepEqual(runtime.loadExports('page'), { value: 'old' })
    assert.deepEqual(socket.closed, [{ code: 1000, reason: 'patch application stopped' }])
    assert.equal(warn.mock.callCount(), 1)
    assert.match(String(warn.mock.calls[0]?.arguments[0]), /patch batch failed/)
})

test('retains one socket and quietly closes it when the host rotates builds', async (context) => {
    const warn = context.mock.method(console, 'warn', () => {})
    const { sockets } = await createTestHarness()
    const socket = sockets[0]
    assert.ok(socket)

    socket.emitControl({ kind: 'close', reason: 'build replaced' })
    assert.deepEqual(socket.closed, [{ code: 1000, reason: 'build replaced' }])
    assert.equal(sockets.length, 1)
    assert.equal(warn.mock.callCount(), 0)
})
