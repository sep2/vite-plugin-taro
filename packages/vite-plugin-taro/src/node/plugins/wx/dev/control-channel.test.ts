import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import test from 'node:test'
import { BehaviorSubject, Subject } from 'rxjs'
import type { ViteDevServer } from 'vite'
import { type BuildAvailability, createControlChannel, hmrControlPath } from './control-channel.ts'
import type { HmrCommand, UpdatePoll, UpdateWriteResult } from './topology/types.ts'

test('turns one HTTP poll into a request-scoped topology fact and correlated write response', async () => {
    const harness = createHarness()
    let observedPoll: UpdatePoll | undefined
    harness.polls$.subscribe((poll) => {
        observedPoll = poll
        harness.updateWriteResults$.next({
            buildId: poll.buildId,
            ok: true,
            publicationId: 1,
            requestId: poll.requestId
        })
    })

    const response = await harness.request({
        action: 'poll',
        appliedVersion: 3,
        buildId: 'build-1',
        clientId: 'client-a',
        token: harness.token
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(JSON.parse(response.body), { type: 'update-published' })
    assert.deepEqual(observedPoll && { ...observedPoll, requestId: '<generated>' }, {
        appliedVersion: 3,
        buildId: 'build-1',
        clientId: 'client-a',
        requestId: '<generated>'
    })
    harness.close()
})

test('completes an outstanding poll directly from a rebuild command without a response registry', async () => {
    const harness = createHarness()
    harness.polls$.subscribe(() => {
        harness.commands$.next({ buildId: 'build-1', kind: 'request-rebuild', reason: 'client-changed' })
    })

    const response = await harness.request({
        action: 'poll',
        appliedVersion: 0,
        buildId: 'build-1',
        clientId: 'client-b',
        token: harness.token
    })

    assert.equal(response.statusCode, 202)
    assert.deepEqual(JSON.parse(response.body), { type: 'rebuilding' })
    harness.close()
})

test('registers modules only for the active physical build', async () => {
    const registrations: unknown[] = []
    const harness = createHarness((clientId, modules) => {
        registrations.push({ clientId, modules })
        return Promise.resolve(true)
    })

    const accepted = await harness.request({
        action: 'modules',
        buildId: 'build-1',
        clientId: 'client-a',
        modules: ['src/app.ts'],
        token: harness.token
    })
    const stale = await harness.request({
        action: 'modules',
        buildId: 'stale',
        clientId: 'client-a',
        modules: ['src/app.ts'],
        token: harness.token
    })

    assert.equal(accepted.statusCode, 204)
    assert.equal(stale.statusCode, 202)
    assert.deepEqual(registrations, [{ clientId: 'client-a', modules: ['src/app.ts'] }])
    harness.close()
})

function createHarness(registerModules: (clientId: string, modules: string[]) => Promise<boolean> = async () => true) {
    let handler: ((request: IncomingMessage, response: ServerResponse) => Promise<void>) | undefined
    const server = {
        middlewares: {
            use(path: string, value: (request: IncomingMessage, response: ServerResponse) => Promise<void>) {
                assert.equal(path, hmrControlPath)
                handler = value
            }
        }
    } as unknown as ViteDevServer
    const buildAvailability$ = new BehaviorSubject<BuildAvailability>({ buildId: 'build-1', kind: 'active' })
    const commands$ = new Subject<HmrCommand>()
    const polls$ = new Subject<UpdatePoll>()
    const updateWriteResults$ = new Subject<UpdateWriteResult>()
    const channel = createControlChannel({
        buildAvailability$,
        commands$,
        polls$,
        registerModules,
        requestRebuild() {},
        server,
        updateWriteResults$
    })

    return {
        ...channel,
        commands$,
        polls$,
        updateWriteResults$,
        async request(body: unknown) {
            assert.ok(handler)
            const request = Readable.from([JSON.stringify(body)]) as IncomingMessage
            Object.assign(request, { method: 'POST' })
            const response = new FakeResponse()
            await handler(request, response as unknown as ServerResponse)
            return response
        }
    }
}

class FakeResponse {
    statusCode = 0
    body = ''
    writableEnded = false

    setHeader(): void {}

    end(body?: string): void {
        this.body = body ?? ''
        this.writableEnded = true
    }
}
