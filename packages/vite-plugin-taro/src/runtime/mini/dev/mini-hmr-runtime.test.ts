import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { DevRuntime } from 'rolldown/experimental/runtime'
import { type RuntimeReport, runtimeControlEvent } from './hmr-protocol.ts'
import type { ConnectMiniSocket, MiniSocketTask } from './mini-hmr-runtime.ts'
import { interpreterServerEvent } from './modes/interpreter/interpreter-protocol.ts'

// The production bundle supplies this lexical base; native Node tests provide the identical Rolldown class.
Object.assign(globalThis, { DevRuntime })
const { MiniHmrRuntime } = await import('./mini-hmr-runtime.ts')
const { createDevtoolsHmrRuntime } = await import('./modes/devtools/devtools-runtime.ts')
const { createInterpreterHmrRuntime } = await import('./modes/interpreter/interpreter-runtime.ts')

function createSocket(endpoint: string, reports: RuntimeReport[]) {
    // One native task owns these mutable listener cells and its OPEN state. Tests explicitly deliver even late callbacks.
    let opened = false
    let onOpen = () => {}
    let onClose = () => {}
    let onError = () => {}
    let onMessage = (_message: Readonly<{ data: unknown }>) => {}
    const closed: Array<{ code: number; reason: string }> = []
    const task: MiniSocketTask = {
        onOpen(listener) {
            onOpen = listener
        },
        onClose(listener) {
            onClose = listener
        },
        onError(listener) {
            onError = listener
        },
        onMessage(listener) {
            onMessage = listener
        },
        send({ data }) {
            assert.ok(opened, 'Never send on a connecting or closed native task')
            const envelope: { data: RuntimeReport } = JSON.parse(data)
            reports.push(envelope.data)
        },
        close(options) {
            closed.push(options)
            opened = false
            onClose()
        }
    }
    return {
        task,
        endpoint,
        closed,
        open() {
            opened = true
            onOpen()
        },
        disconnect() {
            opened = false
            onClose()
        },
        fail() {
            opened = false
            onError()
        },
        message(event: string, data: unknown) {
            onMessage({ data: JSON.stringify({ type: 'custom', event, data }) })
        }
    }
}

function createTransport(context: TestContext) {
    context.mock.timers.enable({ apis: ['setTimeout'] })
    // Append-only observations belong to this runtime, never another test's global WX stub.
    const reports: RuntimeReport[] = []
    const sockets: ReturnType<typeof createSocket>[] = []
    const connect: ConnectMiniSocket = (endpoint) => {
        const socket = createSocket(endpoint, reports)
        sockets.push(socket)
        return socket.task
    }
    return { connect, reports, sockets }
}

const info = { buildId: 'build', endpoint: 'ws://localhost/__vpt_hmr__?token=original' }

test('reconnects the same heap and resumes its applied frontier before replaying skipped Page patches', (context) => {
    const { connect, sockets, reports } = createTransport(context)
    const runtime = createDevtoolsHmrRuntime(connect)
    runtime.initialize(info)
    const first = sockets[0]
    first.open()
    runtime.applyPatches({ buildId: 'build', patches: [{ seq: 1, changedIds: [], factory() {} }] })
    first.disconnect()
    runtime.applyPatches({
        buildId: 'build',
        patches: [
            {
                seq: 2,
                changedIds: [],
                factory() {
                    assert.fail('Wait for OPEN and host replay')
                }
            }
        ]
    })
    runtime.initialize({ buildId: 'different', endpoint: 'ws://wrong-project' })
    context.mock.timers.tick(999)
    assert.equal(sockets.length, 1)
    context.mock.timers.tick(1)
    assert.equal(sockets.length, 2)
    const second = sockets[1]
    assert.equal(second.endpoint, info.endpoint)
    second.open()
    assert.deepEqual(reports, [
        { kind: 'startup', buildId: 'build' },
        { kind: 'applied', buildId: 'build', seq: 1 },
        { kind: 'resume', buildId: 'build', seq: 1 }
    ])
    // The host's retained suffix catches up this heap without resetting its module registry or appliedSeq.
    runtime.applyPatches({
        buildId: 'build',
        patches: [
            {
                seq: 1,
                changedIds: [],
                factory() {
                    assert.fail('Do not replay committed factories')
                }
            },
            { seq: 2, changedIds: [], factory() {} }
        ]
    })
    assert.deepEqual(reports.at(-1), { kind: 'applied', buildId: 'build', seq: 2 })

    // Retired native events cannot clear the replacement task, apply messages, or schedule another retry.
    first.open()
    first.disconnect()
    first.fail()
    first.message(runtimeControlEvent, { kind: 'close', reason: 'late old frame' })
    context.mock.timers.tick(30_000)
    assert.equal(sockets.length, 2)
    assert.deepEqual(second.closed, [])
    runtime.applyPatches({ buildId: 'build', patches: [] })
    assert.deepEqual(reports.at(-1), { kind: 'applied', buildId: 'build', seq: 2 })
})

test('releases failed connecting tasks, deduplicates error/close, and caps exponential retry delay', (context) => {
    const { connect, sockets, reports } = createTransport(context)
    const runtime = createDevtoolsHmrRuntime(connect)
    runtime.initialize(info)
    for (const milliseconds of [1000, 2000, 4000, 8000, 10_000, 10_000]) {
        const socket = sockets[sockets.length - 1]
        const count = sockets.length
        socket.fail()
        socket.disconnect()
        socket.fail()
        assert.deepEqual(socket.closed, [{ code: 1000, reason: 'HMR transport failed' }])
        context.mock.timers.tick(milliseconds - 1)
        assert.equal(sockets.length, count)
        context.mock.timers.tick(1)
        assert.equal(sockets.length, count + 1)
    }
    assert.deepEqual(reports, [])
    const connected = sockets[sockets.length - 1]
    connected.open()
    assert.deepEqual(reports, [{ kind: 'startup', buildId: 'build' }])
    connected.disconnect()
    const count = sockets.length
    context.mock.timers.tick(1000)
    assert.equal(sockets.length, count + 1, 'OPEN resets the backoff')
    sockets[sockets.length - 1].open()
    assert.deepEqual(reports.at(-1), { kind: 'resume', buildId: 'build', seq: 0 })
})

test('terminal host control retires the task before synchronous close callbacks and never reconnects', (context) => {
    const { connect, sockets } = createTransport(context)
    const runtime = createDevtoolsHmrRuntime(connect)
    runtime.initialize(info)
    sockets[0].open()
    sockets[0].message(runtimeControlEvent, { kind: 'close', reason: 'build replaced' })
    sockets[0].fail()
    sockets[0].open()
    context.mock.timers.tick(60_000)
    assert.equal(sockets.length, 1)
    assert.deepEqual(sockets[0].closed, [{ code: 1000, reason: 'build replaced' }])
})

test('terminal stop cancels a pending retry and can release a task before OPEN', (context) => {
    class StoppableRuntime extends MiniHmrRuntime {
        stop(): void {
            this.stopSocket('terminal')
        }
    }
    const { connect, sockets } = createTransport(context)
    const retrying = new StoppableRuntime(connect)
    retrying.initialize(info)
    sockets[0].disconnect()
    retrying.stop()
    context.mock.timers.tick(60_000)
    assert.equal(sockets.length, 1)

    const connecting = new StoppableRuntime(connect)
    connecting.initialize(info)
    sockets[1].message(runtimeControlEvent, { kind: 'close', reason: 'before OPEN is not a valid message' })
    assert.deepEqual(sockets[1].closed, [])
    connecting.stop()
    sockets[1].open()
    context.mock.timers.tick(60_000)
    assert.equal(sockets.length, 2)
    assert.deepEqual(sockets[1].closed, [{ code: 1000, reason: 'terminal' }])
})

test('patch failure remains terminal rather than reopening a partially mutated heap', (context) => {
    context.mock.method(console, 'warn', () => {})
    const { connect, sockets, reports } = createTransport(context)
    const runtime = createDevtoolsHmrRuntime(connect)
    runtime.initialize(info)
    sockets[0].open()
    runtime.applyPatches({
        buildId: 'build',
        patches: [
            {
                seq: 1,
                changedIds: [],
                factory() {
                    throw new Error('bad patch')
                }
            }
        ]
    })
    context.mock.timers.tick(60_000)
    assert.equal(sockets.length, 1)
    assert.deepEqual(reports.at(-1), { kind: 'rebuild', buildId: 'build', reason: 'bad patch' })
})

test('interpreter replacement sockets accept replay but ignore delayed source from the retired task', (context) => {
    const { connect, sockets, reports } = createTransport(context)
    const runtime = createInterpreterHmrRuntime(connect)
    runtime.initialize(info)
    sockets[0].open()
    sockets[0].disconnect()
    context.mock.timers.tick(1000)
    sockets[1].open()
    sockets[0].message(interpreterServerEvent, {
        buildId: 'build',
        patches: [{ seq: 1, changedIds: [], code: 'throw new Error("retired task")' }]
    })
    sockets[1].message(interpreterServerEvent, { buildId: 'build', patches: [{ seq: 1, changedIds: [], code: '' }] })
    assert.deepEqual(reports, [
        { kind: 'startup', buildId: 'build' },
        { kind: 'resume', buildId: 'build', seq: 0 },
        { kind: 'applied', buildId: 'build', seq: 1 }
    ])
})
