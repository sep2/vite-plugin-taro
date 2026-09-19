import assert from 'node:assert/strict'
import test from 'node:test'
import { DevRuntime } from 'rolldown/experimental/runtime'
import { runtimeControlEvent, runtimeReportEvent } from '../../mini/dev/hmr-protocol.ts'
import type { MiniSocketTask } from '../../mini/dev/mini-hmr-runtime.ts'
import { connectTtSocket } from './connect-tt-socket.ts'

test('connects both HMR modes through the TT task-scoped socket', async () => {
    // These local captures observe native connection requests and the listener retained by the shared runtime.
    const connections: unknown[] = []
    const sent: unknown[] = []
    const closed: unknown[] = []
    let receive: Parameters<MiniSocketTask['onMessage']>[0] = () => assert.fail('Missing socket listener')
    const socket: MiniSocketTask = {
        send(options) {
            sent.push(options)
        },
        close(options) {
            closed.push(options)
        },
        onOpen(listener) {
            listener()
        },
        onClose() {},
        onError() {},
        onMessage(listener) {
            receive = listener
        }
    }
    Reflect.set(globalThis, 'DevRuntime', DevRuntime)
    Reflect.set(globalThis, 'tt', {
        connectSocket(options: unknown) {
            connections.push(options)
            return socket
        }
    })
    try {
        assert.strictEqual(connectTtSocket('ws://localhost/direct'), socket)
        for (const mode of ['interpreter', 'devtools']) {
            await import(`./${mode}-runtime.ts`)
            const runtime = Reflect.get(globalThis, '__rolldown_runtime__')
            assert.ok(runtime instanceof DevRuntime)
            assert.ok('initialize' in runtime && typeof runtime.initialize === 'function')
            runtime.initialize({ buildId: mode, endpoint: `ws://localhost/${mode}` })
            assert.deepEqual(sent.at(-1), {
                data: JSON.stringify({
                    type: 'custom',
                    event: runtimeReportEvent,
                    data: { buildId: mode, kind: 'startup' }
                })
            })
            receive({
                data: JSON.stringify({ type: 'custom', event: runtimeControlEvent, data: { reason: 'test complete' } })
            })
            assert.deepEqual(closed.at(-1), { code: 1000, reason: 'test complete' })
        }
        assert.deepEqual(
            connections,
            ['direct', 'interpreter', 'devtools'].map((mode) => ({
                url: `ws://localhost/${mode}`,
                protocols: ['vite-hmr']
            }))
        )
    } finally {
        Reflect.deleteProperty(globalThis, 'tt')
        Reflect.deleteProperty(globalThis, 'DevRuntime')
        Reflect.deleteProperty(globalThis, '__rolldown_runtime__')
    }
})
