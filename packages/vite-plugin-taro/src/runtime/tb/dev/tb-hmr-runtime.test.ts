import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { DevRuntime } from 'rolldown/experimental/runtime'
import { runtimeControlEvent, runtimeReportEvent } from '../../mini/dev/hmr-protocol.ts'
import { interpreterServerEvent } from '../../mini/dev/modes/interpreter/interpreter-protocol.ts'
import { connectTbSocket } from './connect-tb-socket.ts'

type MessageListener = (event: Readonly<{ data: unknown }>) => void
type TerminalListener = (details?: unknown) => void
type ConnectOptions = Readonly<{
    url: string
    header: Readonly<Record<string, string>>
    fail: TerminalListener
}>

/** Each test owns its native listener sets and operation journal; no real socket is opened. */
function createNativeSocket(context: TestContext) {
    const open = new Set<() => void>()
    const close = new Set<TerminalListener>()
    const error = new Set<TerminalListener>()
    const message = new Set<MessageListener>()
    const connects: ConnectOptions[] = []
    const sends: string[] = []
    const closes: string[] = []
    const native = {
        connectSocket: (options: ConnectOptions) => connects.push(options),
        sendSocketMessage: ({ data }: { data: string }) => sends.push(data),
        closeSocket: () => closes.push('close'),
        onSocketOpen: (listener: () => void) => open.add(listener),
        offSocketOpen: (listener: () => void) => open.delete(listener),
        onSocketClose: (listener: TerminalListener) => close.add(listener),
        offSocketClose: (listener: TerminalListener) => close.delete(listener),
        onSocketError: (listener: TerminalListener) => error.add(listener),
        offSocketError: (listener: TerminalListener) => error.delete(listener),
        onSocketMessage: (listener: MessageListener) => message.add(listener),
        offSocketMessage: (listener: MessageListener) => message.delete(listener)
    }
    // Restore the host binding after each isolated runtime exercise.
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'my')
    Reflect.set(globalThis, 'my', native)
    context.after(() => {
        if (descriptor) {
            Object.defineProperty(globalThis, 'my', descriptor)
        } else {
            Reflect.deleteProperty(globalThis, 'my')
        }
    })
    return { open, close, error, message, connects, sends, closes }
}

for (const termination of ['close', 'error', 'client'] as const) {
    test(`adapts Taobao global socket events and detaches only its own listeners on ${termination}`, (context) => {
        const native = createNativeSocket(context)
        const foreignListener = () => {}
        for (const listeners of [native.open, native.close, native.error, native.message]) {
            listeners.add(foreignListener)
        }
        const socket = connectTbSocket('ws://localhost/hmr?token=fixture')
        assert.deepEqual(native.connects, [
            {
                url: 'ws://localhost/hmr?token=fixture',
                header: { 'Sec-WebSocket-Protocol': 'vite-hmr' },
                fail: [...native.error].find((listener) => listener !== foreignListener)
            }
        ])
        // Listener assignment is synchronous; early native notifications have no consumer yet.
        for (const listener of native.open) {
            listener()
        }
        for (const listener of native.message) {
            listener({ data: 'early' })
        }
        // The journal records delivery order and confirms messages retain their native data field.
        const events: unknown[] = []
        socket.onOpen(() => events.push('open'))
        socket.onClose(() => events.push('close'))
        socket.onError(() => events.push('error'))
        socket.onMessage((event) => events.push(event))
        for (const listener of native.open) {
            listener()
        }
        const message = { data: 'server payload' }
        for (const listener of native.message) {
            listener(message)
        }
        assert.deepEqual(events, ['open', message])
        assert.equal(events[1], message)
        socket.send({ data: 'client payload' })
        assert.deepEqual(native.sends, ['client payload'])
        if (termination === 'client') {
            socket.close({ code: 1000, reason: 'complete' })
            assert.deepEqual(native.closes, ['close'])
        } else {
            for (const listener of [...native[termination]]) {
                listener()
            }
            assert.equal(events.at(-1), termination)
        }
        for (const listeners of [native.open, native.close, native.error, native.message]) {
            assert.deepEqual([...listeners], [foreignListener])
        }
    })
}

for (const event of ['close', 'error', 'fail'] as const) {
    test(`preserves native Taobao ${event} details`, (context) => {
        const native = createNativeSocket(context)
        const socket = connectTbSocket('ws://localhost/hmr')
        const details = { error: 8, errorMessage: 'Invalid protocol header', code: 1006, reason: 'Handshake failed' }
        const receive = context.mock.fn()
        socket.onClose(receive)
        socket.onError(receive)
        if (event === 'fail') {
            native.connects[0]!.fail(details)
        } else {
            for (const listener of [...native[event]]) {
                listener(details)
            }
        }
        assert.deepEqual(
            receive.mock.calls.map(({ arguments: args }) => args),
            [[details]]
        )
        assert.equal(native.message.size, 0)
    })
}

for (const event of ['close', 'error'] as const) {
    test(`releases an early Taobao ${event} before consumer registration`, (context) => {
        const native = createNativeSocket(context)
        connectTbSocket('ws://localhost/hmr')
        for (const listener of [...native[event]]) {
            listener()
        }
        assert.equal(native.message.size, 0)
    })
}

test('installs both Taobao HMR entries and applies interpreter patches through native data messages', async (context) => {
    const native = createNativeSocket(context)
    context.after(() => Reflect.deleteProperty(globalThis, '__rolldown_runtime__'))

    for (const mode of ['interpreter', 'devtools'] as const) {
        await import(`./${mode}-runtime.ts`)
        const runtime: unknown = Reflect.get(globalThis, '__rolldown_runtime__')
        assert.ok(runtime instanceof DevRuntime)
        assert.ok('initialize' in runtime && typeof runtime.initialize === 'function')
        Reflect.apply(runtime.initialize, runtime, [{ buildId: mode, endpoint: `ws://localhost/${mode}` }])
        for (const listener of native.open) {
            listener()
        }
        assert.deepEqual(JSON.parse(native.sends.at(-1)!), {
            type: 'custom',
            event: runtimeReportEvent,
            data: { buildId: mode, kind: 'startup' }
        })
        if (mode === 'interpreter') {
            const payload = {
                type: 'custom',
                event: interpreterServerEvent,
                data: {
                    kind: 'patches',
                    buildId: mode,
                    patches: [
                        {
                            type: 'Patch',
                            seq: 1,
                            changedIds: ['tb-feature'],
                            code: "__rolldown_runtime__.registerFactory('tb-feature', () => {})"
                        }
                    ]
                }
            }
            for (const listener of native.message) {
                listener({ data: JSON.stringify(payload) })
            }
            assert.equal(runtime.hasFactory('tb-feature'), true)
            assert.deepEqual(JSON.parse(native.sends.at(-1)!), {
                type: 'custom',
                event: runtimeReportEvent,
                data: { buildId: mode, kind: 'applied', seq: 1 }
            })
        }
        for (const listener of [...native.message]) {
            listener({
                data: JSON.stringify({
                    type: 'custom',
                    event: runtimeControlEvent,
                    data: { kind: 'close', reason: 'test complete' }
                })
            })
        }
        assert.equal(native.open.size, 0)
        assert.equal(native.message.size, 0)
    }
    assert.deepEqual(native.closes, ['close', 'close'])
})
