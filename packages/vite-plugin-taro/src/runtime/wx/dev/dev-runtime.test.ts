import assert from 'node:assert/strict'
import test from 'node:test'
import type { Messenger } from 'rolldown/experimental/runtime-types'

class MockRolldownDevRuntime {
    readonly messenger: Messenger
    readonly clientId: string

    constructor(messenger: Messenger, clientId: string) {
        this.messenger = messenger
        this.clientId = clientId
    }
}

type RuntimeUnderTest = MockRolldownDevRuntime & {
    setHmrInfo(info: { buildId: string; endpoint: string }): void
}

const requests: WeChatRequestOptions[] = []
const runtimeGlobal = globalThis as typeof globalThis & {
    DevRuntime: typeof MockRolldownDevRuntime
    wx: { request(options: WeChatRequestOptions): void }
    __rolldown_runtime__: RuntimeUnderTest
}
runtimeGlobal.DevRuntime = MockRolldownDevRuntime
runtimeGlobal.wx = {
    request(options) {
        requests.push(options)
    }
}

await import('./dev-runtime.ts')

test('sends Vite-style client hello and immediately forwards each Rolldown-batched module report', () => {
    const runtime = runtimeGlobal.__rolldown_runtime__
    runtime.messenger.send({ type: 'hmr:module-registered', modules: ['before-app'] })
    assert.deepEqual(requests, [])

    runtime.setHmrInfo({ buildId: 'build-1', endpoint: 'http://127.0.0.1:5174/hmr' })
    assert.deepEqual(requestAt(0).data, {
        buildId: 'build-1',
        clientId: runtime.clientId,
        modules: []
    })

    // Rolldown clears and reuses its emitted array after Messenger.send(), so DevRuntime must retain a copy.
    const modules = ['first-module']
    runtime.messenger.send({ type: 'hmr:module-registered', modules })
    modules[0] = 'mutated-after-send'
    assert.deepEqual(requestAt(1).data, {
        buildId: 'build-1',
        clientId: runtime.clientId,
        modules: ['first-module']
    })

    runtime.messenger.send({ type: 'hmr:module-registered', modules: ['second-module'] })
    assert.deepEqual(requestAt(2).data, {
        buildId: 'build-1',
        clientId: runtime.clientId,
        modules: ['second-module']
    })
})

/** Reads an asynchronously recorded wx.request call without teaching TypeScript that the array is permanently empty. */
function requestAt(index: number): WeChatRequestOptions {
    const request = requests[index]
    if (!request) {
        throw new Error(`Missing wx.request call ${index}.`)
    }
    return request
}
