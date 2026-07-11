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

function startClient(buildId: string, sessionId: string): WxUpdateClientState {
    let client = createWxUpdateClientState(buildId, sessionId)
    client = transitionWxUpdateClient(client, { type: 'started' }).state
    return transitionWxUpdateClient(client, { type: 'registration-completed' }).state
}

function registerClient(server: WxUpdateServerState, client: WxUpdateClientState): WxUpdateServerState {
    return transitionWxUpdateServer(server, {
        type: 'client-registered',
        buildId: client.buildId,
        sessionId: client.sessionId,
        version: client.version
    }).state
}

function requestBatch(server: WxUpdateServerState, client: WxUpdateClientState) {
    return transitionWxUpdateServer(server, {
        type: 'client-reported',
        buildId: client.buildId,
        sessionId: client.sessionId,
        version: client.version
    })
}

function applyBatch(client: WxUpdateClientState, batch: WxUpdateBatch, stale = false): WxUpdateClientState {
    client = transitionWxUpdateClient(client, {
        type: 'batch-observed',
        buildId: batch.buildId,
        fromVersion: batch.fromVersion,
        targetVersion: batch.targetVersion
    }).state
    client = transitionWxUpdateClient(client, {
        type: 'batch-executed',
        targetVersion: batch.targetVersion
    }).state
    client = transitionWxUpdateClient(client, { type: 'refresh-completed', stale }).state
    if (stale) client = transitionWxUpdateClient(client, { type: 'route-ready' }).state
    return client
}

function publishedBatch(server: WxUpdateServerState, client: WxUpdateClientState) {
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

    assert.equal(client.version, 1)
    assert.equal(client.phase, 'polling')
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
    const oldClient = { ...startClient('build-1', 'old-session'), version: 3 }
    server = registerClient(server, oldClient)

    let restarted = startClient('build-1', 'new-session')
    server = registerClient(server, restarted)
    const replay = publishedBatch(server, restarted)
    restarted = applyBatch(restarted, replay.batch)

    assert.equal(restarted.version, 3)
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
    assert.equal(client.version, 1)
    assert.equal(client.phase, 'polling')
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
    assert.equal(newClient.version, 0)
    assert.deepEqual(requestBatch(server, newClient).commands, [])
})
