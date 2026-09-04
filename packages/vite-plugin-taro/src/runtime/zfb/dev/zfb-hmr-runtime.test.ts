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

test('uses the Alipay API socket while installing both HMR modes on the shared runtime global', async () => {
    // This mutable capture records native connector input while the imported entries replace the App-global runtime singleton.
    const connectOptions: unknown[] = []
    const nativeQueueMicrotask = globalThis.queueMicrotask
    Reflect.deleteProperty(globalThis, 'queueMicrotask')
    Reflect.set(globalThis, 'DevRuntime', DevRuntime)
    Reflect.set(globalThis, 'my', {
        connectSocket(options: unknown): MiniSocketTask {
            connectOptions.push(options)
            return socket
        }
    })

    try {
        const { connectZfbSocket } = await import('./connect-zfb-socket.ts')
        assert.strictEqual(connectZfbSocket('ws://localhost/hmr'), socket)
        assert.deepEqual(connectOptions, [{ url: 'ws://localhost/hmr', multiple: true, protocols: ['vite-hmr'] }])

        await importRuntimeEntry('devtools')
        const installedQueueMicrotask = Reflect.get(global, 'queueMicrotask')
        assert.ok(typeof installedQueueMicrotask === 'function')
        // This mutable observation proves entry evaluation installs the fallback before later Refresh work can be scheduled.
        let microtaskCompleted = false
        Reflect.apply(installedQueueMicrotask, undefined, [() => (microtaskCompleted = true)])
        assert.equal(microtaskCompleted, false)
        await Promise.resolve()
        assert.equal(microtaskCompleted, true)

        const devtoolsRuntime = Reflect.get(global, '__rolldown_runtime__')
        assert.ok(devtoolsRuntime instanceof DevRuntime)
        initializeRuntime(devtoolsRuntime, 'devtools')

        await importRuntimeEntry('interpreter')
        const interpreterRuntime = Reflect.get(global, '__rolldown_runtime__')
        assert.ok(interpreterRuntime instanceof DevRuntime)
        assert.notStrictEqual(interpreterRuntime, devtoolsRuntime)
        initializeRuntime(interpreterRuntime, 'interpreter')

        assert.deepEqual(connectOptions, [
            { url: 'ws://localhost/hmr', multiple: true, protocols: ['vite-hmr'] },
            { url: 'ws://localhost/devtools', multiple: true, protocols: ['vite-hmr'] },
            { url: 'ws://localhost/interpreter', multiple: true, protocols: ['vite-hmr'] }
        ])
    } finally {
        Reflect.deleteProperty(global, '__rolldown_runtime__')
        Reflect.deleteProperty(globalThis, 'DevRuntime')
        Reflect.deleteProperty(globalThis, 'my')
        Reflect.set(globalThis, 'queueMicrotask', nativeQueueMicrotask)
    }
})
