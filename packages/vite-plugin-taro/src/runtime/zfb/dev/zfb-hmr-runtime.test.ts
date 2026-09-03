import assert from 'node:assert/strict'
import test from 'node:test'
import { DevRuntime } from 'rolldown/experimental/runtime'
import type { MiniSocketTask } from '../../mini/dev/mini-hmr-runtime.ts'

const socket: MiniSocketTask = {
    send() {},
    close() {},
    onMessage() {}
}

function importRuntimeEntry(mode: 'devtools' | 'interpreter'): Promise<unknown> {
    return import(`./${mode}-runtime.ts?zfb-entry`)
}

function initializeRuntime(runtime: unknown, buildId: string): void {
    assert.ok(
        runtime && typeof runtime === 'object' && 'initialize' in runtime && typeof runtime.initialize === 'function'
    )
    Reflect.apply(runtime.initialize, runtime, [{ buildId: buildId, endpoint: `ws://localhost/${buildId}` }])
}

test('uses an independent Alipay SocketTask and installs both shared HMR modes on my', async () => {
    // These mutable captures record the native connector input and the current App-global runtime installation.
    const connectOptions: unknown[] = []
    const runtimeGlobal = {}
    Reflect.set(globalThis, 'DevRuntime', DevRuntime)
    Reflect.set(globalThis, '__VPT_RUNTIME_GLOBAL__', runtimeGlobal)
    Reflect.set(globalThis, 'my', {
        connectSocket(options: unknown): MiniSocketTask {
            connectOptions.push(options)
            return socket
        }
    })

    const { connectZfbSocket } = await import('./connect-zfb-socket.ts')
    assert.strictEqual(connectZfbSocket('ws://localhost/hmr'), socket)
    assert.deepEqual(connectOptions, [{ url: 'ws://localhost/hmr', multiple: true, protocols: ['vite-hmr'] }])

    await importRuntimeEntry('devtools')
    const devtoolsRuntime = Reflect.get(runtimeGlobal, '__rolldown_runtime__')
    assert.ok(devtoolsRuntime instanceof DevRuntime)
    initializeRuntime(devtoolsRuntime, 'devtools')

    await importRuntimeEntry('interpreter')
    const interpreterRuntime = Reflect.get(runtimeGlobal, '__rolldown_runtime__')
    assert.ok(interpreterRuntime instanceof DevRuntime)
    assert.notStrictEqual(interpreterRuntime, devtoolsRuntime)
    initializeRuntime(interpreterRuntime, 'interpreter')

    assert.deepEqual(connectOptions, [
        { url: 'ws://localhost/hmr', multiple: true, protocols: ['vite-hmr'] },
        { url: 'ws://localhost/devtools', multiple: true, protocols: ['vite-hmr'] },
        { url: 'ws://localhost/interpreter', multiple: true, protocols: ['vite-hmr'] }
    ])
})
