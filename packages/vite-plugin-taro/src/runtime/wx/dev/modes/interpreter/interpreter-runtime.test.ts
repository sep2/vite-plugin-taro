import assert from 'node:assert/strict'
import test from 'node:test'
import { DevRuntime } from 'rolldown/experimental/runtime'
import {
    type InterpreterServerMessage,
    interpreterClientEvent,
    interpreterServerEvent
} from './interpreter-protocol.ts'

type TestHotContext = Readonly<{
    accept: (callback?: (moduleExports: unknown) => void) => void
}>

type TestRuntime = DevRuntime &
    Readonly<{
        createModuleHotContext: (moduleId: string) => TestHotContext
        initialize: (info: { buildId: string; endpoint: string; socketEndpoint: string }) => void
    }>

type RequestResult = Readonly<{
    statusCode: number
    data: undefined
}>

type CapturedRequest = Readonly<{
    url: string
    method: 'POST'
    data: unknown
    header?: Readonly<Record<string, string>>
    success: (result: RequestResult) => void
    fail: (error: unknown) => void
}>

type ConnectOptions = Readonly<{
    url: string
    protocols: readonly string[]
    fail?: (error: unknown) => void
}>

type SentSocketMessage = Readonly<{
    data: string | ArrayBuffer
    fail?: (error: unknown) => void
}>

type CapturedSocket = WeChatSocketTask &
    Readonly<{
        connectOptions: ConnectOptions
        closed: Array<Readonly<{ code: number; reason: string }>>
        sent: SentSocketMessage[]
        emitOpen: () => void
        emitMessage: (message: InterpreterServerMessage) => void
        emitClose: () => void
        emitError: () => void
    }>

type TestHarness = Readonly<{
    reports: unknown[]
    runtime: TestRuntime
    sockets: CapturedSocket[]
}>

// Mutable only to give every dynamic import an independent module identity and therefore a fresh interpreter singleton.
let runtimeId = 0

function createSocket(connectOptions: ConnectOptions): CapturedSocket {
    // These mutable listener cells model the one callback registered for each native SocketTask event.
    let openListener = () => {}
    let messageListener = (_result: Readonly<{ data: string | ArrayBuffer }>) => {}
    let closeListener = (_result: Readonly<{ code: number; reason: string }>) => {}
    let errorListener = (_error: unknown) => {}
    const sent: SentSocketMessage[] = []
    const closed: Array<Readonly<{ code: number; reason: string }>> = []

    return {
        connectOptions: connectOptions,
        sent: sent,
        closed: closed,
        send(options) {
            sent.push(options)
        },
        close(options) {
            closed.push(options)
        },
        onOpen(listener) {
            openListener = listener
        },
        onMessage(listener) {
            messageListener = listener
        },
        onClose(listener) {
            closeListener = listener
        },
        onError(listener) {
            errorListener = listener
        },
        emitOpen() {
            openListener()
        },
        emitMessage(message) {
            messageListener({
                data: JSON.stringify({ type: 'custom', event: interpreterServerEvent, data: message })
            })
        },
        emitClose() {
            closeListener({ code: 1006, reason: 'connection ended' })
        },
        emitError() {
            errorListener(new Error('connection failed'))
        }
    }
}

async function createTestHarness(): Promise<TestHarness> {
    // These mutable lists capture native network effects from one isolated runtime instance.
    const reports: unknown[] = []
    const sockets: CapturedSocket[] = []
    Object.assign(globalThis, {
        DevRuntime,
        wx: {
            request(options: CapturedRequest): void {
                reports.push(options.data)
                options.success({ statusCode: 200, data: undefined })
            },
            connectSocket(options: ConnectOptions): CapturedSocket {
                const socket = createSocket(options)
                sockets.push(socket)
                return socket
            }
        }
    })

    runtimeId++
    await import(`./interpreter-runtime.ts?test=${runtimeId}`)
    const runtime = (globalThis as typeof globalThis & { __rolldown_runtime__?: TestRuntime }).__rolldown_runtime__
    if (!runtime) throw new Error('WX interpreter runtime was not installed')

    runtime.initialize({
        buildId: 'build',
        endpoint: 'http://localhost/__vpt_hmr__',
        socketEndpoint: 'ws://localhost/?token=test'
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

test('subscribes, interprets cumulative source, and reports its application frontier', async () => {
    const { reports, runtime, sockets } = await createTestHarness()
    // This mutable cell captures the fresh boundary exports passed by the shared graph application transaction.
    let acceptedExports: unknown
    registerInitialBoundary(runtime, (moduleExports) => {
        acceptedExports = moduleExports
    })

    const socket = sockets[0]
    assert.ok(socket)
    assert.equal(socket.connectOptions.url, 'ws://localhost/?token=test')
    assert.deepEqual(socket.connectOptions.protocols, ['vite-hmr'])
    assert.equal(socket.connectOptions.fail, undefined)

    socket.emitOpen()
    assert.deepEqual(JSON.parse(String(socket.sent[0]?.data)), {
        type: 'custom',
        event: interpreterClientEvent,
        data: { buildId: 'build' }
    })

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

test('resubscribes after disconnect and stops when the host rotates builds', async () => {
    const { sockets } = await createTestHarness()
    const firstSocket = sockets[0]
    assert.ok(firstSocket)

    firstSocket.emitError()
    assert.equal(sockets.length, 2)
    firstSocket.emitClose()
    assert.equal(sockets.length, 2)
    const secondSocket = sockets[1]
    assert.ok(secondSocket)
    secondSocket.emitOpen()
    assert.deepEqual(JSON.parse(String(secondSocket.sent[0]?.data)), {
        type: 'custom',
        event: interpreterClientEvent,
        data: { buildId: 'build' }
    })

    // A callback from the replaced socket cannot affect the active task.
    firstSocket.emitMessage({ kind: 'close', reason: 'host closed' })
    assert.equal(firstSocket.closed.length, 0)

    secondSocket.emitMessage({ kind: 'close', reason: 'build replaced' })
    assert.deepEqual(secondSocket.closed, [{ code: 1000, reason: 'build replaced' }])
    secondSocket.emitClose()
    assert.equal(sockets.length, 2)
})
