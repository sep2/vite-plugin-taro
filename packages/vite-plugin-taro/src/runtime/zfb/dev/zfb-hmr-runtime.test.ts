import assert from 'node:assert/strict'
import test from 'node:test'
import { DevRuntime } from 'rolldown/experimental/runtime'
import { runtimeReportEvent } from '../../mini/dev/hmr-protocol.ts'
import { interpreterServerEvent } from '../../mini/dev/modes/interpreter/interpreter-protocol.ts'

type NativeMessageListener = (result: Readonly<{ message: string }>) => void

function importRuntimeEntry(mode: 'devtools' | 'interpreter'): Promise<unknown> {
    return import(`./${mode}-runtime.ts?zfb-entry`)
}

function initializeRuntime(runtime: unknown, buildId: string): void {
    assert.ok(
        runtime && typeof runtime === 'object' && 'initialize' in runtime && typeof runtime.initialize === 'function'
    )
    Reflect.apply(runtime.initialize, runtime, [{ buildId: buildId, endpoint: `ws://localhost/${buildId}` }])
}

test('adapts the Alipay socket while installing both patch modes on the shared runtime global', async () => {
    // These mutable captures model one native SocketTask and record every operation crossing the ZFB adapter boundary.
    const connectOptions: unknown[] = []
    const sentOptions: unknown[] = []
    const closeOptions: unknown[] = []
    let emitNativeMessage: (message: string) => void = (_message) =>
        assert.fail('Alipay message listener was not installed')
    const nativeSocket = {
        send: (options: unknown): void => {
            sentOptions.push(options)
        },
        close: (options: unknown): void => {
            closeOptions.push(options)
        },
        onMessage: (listener: NativeMessageListener): void => {
            emitNativeMessage = (message) => listener({ message: message })
        }
    }

    const nativeQueueMicrotask = globalThis.queueMicrotask
    Reflect.deleteProperty(globalThis, 'queueMicrotask')
    Reflect.set(globalThis, 'DevRuntime', DevRuntime)
    Reflect.set(globalThis, 'my', {
        connectSocket: (options: unknown) => {
            connectOptions.push(options)
            return nativeSocket
        }
    })

    try {
        const { connectZfbSocket } = await import('./connect-zfb-socket.ts')
        const socket = connectZfbSocket('ws://localhost/hmr')
        assert.deepEqual(connectOptions, [{ url: 'ws://localhost/hmr', multiple: true, protocols: ['vite-hmr'] }])

        // This mutable observation proves Alipay's `{ message }` event reaches the shared runtime as `{ data }`.
        let receivedData: unknown
        socket.onMessage(({ data }) => {
            receivedData = data
        })
        emitNativeMessage('server message')
        assert.equal(receivedData, 'server message')

        socket.send({ data: 'client message' })
        socket.close({ code: 1000, reason: 'test complete' })
        assert.deepEqual(sentOptions, [{ data: 'client message' }])
        assert.deepEqual(closeOptions, [{ code: 1000, reason: 'test complete' }])

        // Load interpreter mode while the host primitive is still absent. Sval therefore snapshots the same ZFB environment
        // that exposed the real bug before MiniHmrRuntime installs its language-global fallback.
        await importRuntimeEntry('interpreter')
        const interpreterRuntime = Reflect.get(globalThis, '__rolldown_runtime__')
        assert.ok(interpreterRuntime instanceof DevRuntime)
        initializeRuntime(interpreterRuntime, 'interpreter')

        const installedQueueMicrotask = Reflect.get(globalThis, 'queueMicrotask')
        assert.ok(typeof installedQueueMicrotask === 'function')
        // This mutable observation proves entry evaluation installs the fallback before later Refresh work can be scheduled.
        let microtaskCompleted = false
        Reflect.apply(installedQueueMicrotask, undefined, [() => (microtaskCompleted = true)])
        assert.equal(microtaskCompleted, false)
        await Promise.resolve()
        assert.equal(microtaskCompleted, true)

        emitNativeMessage(
            JSON.stringify({
                type: 'custom',
                event: interpreterServerEvent,
                data: {
                    kind: 'patches',
                    buildId: 'interpreter',
                    patches: [
                        {
                            type: 'Patch',
                            seq: 1,
                            changedIds: ['new-module'],
                            code: "queueMicrotask(() => {}); __rolldown_runtime__.registerFactory('new-module', 'esm', () => {})"
                        }
                    ]
                }
            })
        )

        assert.equal(interpreterRuntime.hasFactory('new-module'), true)
        const reportSend = sentOptions.at(-1)
        assert.ok(
            reportSend && typeof reportSend === 'object' && 'data' in reportSend && typeof reportSend.data === 'string'
        )
        const report: unknown = JSON.parse(reportSend.data)
        assert.deepEqual(report, {
            type: 'custom',
            event: runtimeReportEvent,
            data: { buildId: 'interpreter', kind: 'applied', seq: 1 }
        })

        await importRuntimeEntry('devtools')
        const devtoolsRuntime = Reflect.get(globalThis, '__rolldown_runtime__')
        assert.ok(devtoolsRuntime instanceof DevRuntime)
        assert.notStrictEqual(devtoolsRuntime, interpreterRuntime)
        initializeRuntime(devtoolsRuntime, 'devtools')

        assert.deepEqual(connectOptions, [
            { url: 'ws://localhost/hmr', multiple: true, protocols: ['vite-hmr'] },
            { url: 'ws://localhost/interpreter', multiple: true, protocols: ['vite-hmr'] },
            { url: 'ws://localhost/devtools', multiple: true, protocols: ['vite-hmr'] }
        ])
    } finally {
        Reflect.deleteProperty(globalThis, '__rolldown_runtime__')
        Reflect.deleteProperty(globalThis, 'DevRuntime')
        Reflect.deleteProperty(globalThis, 'my')
        Reflect.set(globalThis, 'queueMicrotask', nativeQueueMicrotask)
    }
})
