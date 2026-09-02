import assert from 'node:assert/strict'
import test from 'node:test'
import { DevRuntime } from 'rolldown/experimental/runtime'
import { type RuntimeControlMessage, runtimeControlEvent, runtimeReportEvent } from '../../hmr-protocol.ts'
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

type CapturedSocket = WeChatSocketTask &
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
    // This mutable listener cell models the callback registered for native SocketTask messages.
    let messageListener = (_result: Readonly<{ data: string | ArrayBuffer }>) => {}
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
        },
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
        DevRuntime,
        __VPT_RUNTIME_GLOBAL__: globalThis,
        wx: {
            connectSocket(options: ConnectOptions): CapturedSocket {
                const socket = createSocket(options, reports)
                sockets.push(socket)
                return socket
            }
        }
    })

    runtimeId++
    await import(`../../../../wx/dev/modes/interpreter/interpreter-runtime.ts?test=${runtimeId}`)
    const runtime = (globalThis as typeof globalThis & { __rolldown_runtime__?: TestRuntime }).__rolldown_runtime__
    if (!runtime) throw new Error('Mini Program interpreter runtime was not installed')

    runtime.initialize({
        buildId: 'build',
        endpoint: 'ws://localhost/__vpt_hmr__?token=test'
    })
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
    context.mock.method(console, 'warn', () => {})
    const { reports, runtime, sockets } = await createTestHarness()
    registerInitialBoundary(runtime, () => {})

    const socket = sockets[0]
    assert.ok(socket)
    socket.emitMessage({
        kind: 'patches',
        buildId: 'build',
        patches: [{ seq: 1, changedIds: ['page'], code: "throw new Error('broken program')" }]
    })

    assert.deepEqual(reports, [{ buildId: 'build', kind: 'rebuild', reason: 'broken program' }])
    assert.deepEqual(runtime.loadExports('page'), { value: 'old' })
    assert.deepEqual(socket.closed, [{ code: 1000, reason: 'patch application stopped' }])
})

test('retains one socket and closes it when the host rotates builds', async () => {
    const { sockets } = await createTestHarness()
    const socket = sockets[0]
    assert.ok(socket)

    socket.emitControl({ kind: 'close', reason: 'build replaced' })
    assert.deepEqual(socket.closed, [{ code: 1000, reason: 'build replaced' }])
    assert.equal(sockets.length, 1)
})
