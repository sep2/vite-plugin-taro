import assert from 'node:assert/strict'
import test from 'node:test'
import {
    createWxUpdateClientState,
    transitionWxUpdateClient,
    type WxUpdateClientState
} from '../../../../runtime/wx/update-client-state.ts'
import {
    createWxUpdateServerState,
    transitionWxUpdateServer,
    type WxUpdateBatch,
    type WxUpdateServerState
} from './update-server-state.ts'

type ProtocolClient = {
    sessionId: string
    state: WxUpdateClientState
}

function startClient(buildId: string, sessionId: string): ProtocolClient {
    let state = createWxUpdateClientState(buildId)
    state = transitionWxUpdateClient(state, { type: 'started' }).state
    state = transitionWxUpdateClient(state, { type: 'registration-completed' }).state
    return { sessionId, state }
}

function registerClient(server: WxUpdateServerState, client: ProtocolClient): WxUpdateServerState {
    return transitionWxUpdateServer(server, {
        type: 'client-registered',
        buildId: client.state.buildId,
        sessionId: client.sessionId,
        version: client.state.version
    }).state
}

function requestBatch(server: WxUpdateServerState, client: ProtocolClient) {
    return transitionWxUpdateServer(server, {
        type: 'client-reported',
        buildId: client.state.buildId,
        sessionId: client.sessionId,
        version: client.state.version
    })
}

function applyBatch(client: ProtocolClient, batch: WxUpdateBatch, stale = false): ProtocolClient {
    let state = transitionWxUpdateClient(client.state, {
        type: 'batch-observed',
        buildId: batch.buildId,
        fromVersion: batch.fromVersion,
        targetVersion: batch.targetVersion
    }).state
    state = transitionWxUpdateClient(state, {
        type: 'batch-executed',
        targetVersion: batch.targetVersion
    }).state
    state = transitionWxUpdateClient(state, { type: 'refresh-completed', stale }).state
    if (stale) state = transitionWxUpdateClient(state, { type: 'route-ready' }).state
    return { ...client, state }
}

function publishedBatch(server: WxUpdateServerState, client: ProtocolClient) {
    const transition = requestBatch(server, client)
    const command = transition.commands[0]
    assert.equal(command?.type, 'publish-batch')
    if (command?.type !== 'publish-batch') throw new Error('Expected a published batch.')
    return { server: transition.state, batch: command.batch }
}

test('server and client advance through a complete acknowledged batch', () => {
    let server = transitionWxUpdateServer(createWxUpdateServerState('build-1'), {
        type: 'delta-added',
        code: 'delta-1'
    }).state
    let client = startClient('build-1', 'session-1')
    server = registerClient(server, client)

    const published = publishedBatch(server, client)
    server = published.server
    client = applyBatch(client, published.batch)
    server = requestBatch(server, client).state

    assert.equal(client.state.version, 1)
    assert.equal(client.state.phase, 'polling')
    assert.equal(server.inFlight, undefined)
    assert.equal(server.hostVersion, 1)
})

test('deltas arriving during an in-flight batch are sent only after acknowledgement', () => {
    let server = transitionWxUpdateServer(createWxUpdateServerState('build-1'), {
        type: 'delta-added',
        code: 'delta-1'
    }).state
    let client = startClient('build-1', 'session-1')
    server = registerClient(server, client)
    const first = publishedBatch(server, client)
    server = transitionWxUpdateServer(first.server, { type: 'delta-added', code: 'delta-2' }).state
    server = transitionWxUpdateServer(server, { type: 'delta-added', code: 'delta-3' }).state

    const retry = requestBatch(server, client).commands[0]
    assert.equal(retry?.type, 'publish-batch')
    if (retry?.type === 'publish-batch') assert.equal(retry.batch.targetVersion, 1)

    client = applyBatch(client, first.batch)
    const second = publishedBatch(server, client)
    assert.equal(second.batch.fromVersion, 1)
    assert.equal(second.batch.targetVersion, 3)
    assert.deepEqual(
        second.batch.deltas.map((delta) => delta.version),
        [2, 3]
    )
})

test('a restarted App Service reconstructs the host version from retained deltas', () => {
    let server = createWxUpdateServerState('build-1')
    for (const code of ['delta-1', 'delta-2', 'delta-3']) {
        server = transitionWxUpdateServer(server, { type: 'delta-added', code }).state
    }
    const oldClient = startClient('build-1', 'old-session')
    oldClient.state = { ...oldClient.state, version: 3 }
    server = registerClient(server, oldClient)

    let restarted = startClient('build-1', 'new-session')
    server = registerClient(server, restarted)
    const replay = publishedBatch(server, restarted)
    restarted = applyBatch(restarted, replay.batch)

    assert.equal(restarted.state.version, 3)
    assert.deepEqual(
        replay.batch.deltas.map((delta) => delta.version),
        [1, 2, 3]
    )
})

test('lost acknowledgement and stale-family relaunch both converge without duplicate execution', () => {
    let server = transitionWxUpdateServer(createWxUpdateServerState('build-1'), {
        type: 'delta-added',
        code: 'delta-1'
    }).state
    let client = startClient('build-1', 'session-1')
    server = registerClient(server, client)
    const published = publishedBatch(server, client)
    server = published.server
    client = applyBatch(client, published.batch, true)

    const recovered = requestBatch(server, client)
    assert.equal(recovered.state.inFlight, undefined)
    assert.deepEqual(recovered.commands, [])
    assert.equal(client.state.version, 1)
    assert.equal(client.state.phase, 'polling')
})

test('a full build invalidates old sessions and starts both machines at version zero', () => {
    let server = transitionWxUpdateServer(createWxUpdateServerState('build-1'), {
        type: 'delta-added',
        code: 'delta-1'
    }).state
    const oldClient = startClient('build-1', 'session-1')
    server = registerClient(server, oldClient)
    server = transitionWxUpdateServer(server, { type: 'full-build-committed', buildId: 'build-2' }).state
    const newClient = startClient('build-2', 'session-2')
    server = registerClient(server, newClient)

    assert.equal(server.buildId, 'build-2')
    assert.equal(server.hostVersion, 0)
    assert.equal(newClient.state.version, 0)
    assert.deepEqual(requestBatch(server, newClient).commands, [])
})
