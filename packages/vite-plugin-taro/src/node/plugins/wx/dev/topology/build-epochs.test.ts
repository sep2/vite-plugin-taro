import assert from 'node:assert/strict'
import test from 'node:test'
import { Subject } from 'rxjs'
import { type BuildFlowValue, createBuildFlow$ } from './build-epochs.ts'
import type { BootstrapWriteResult, BuildRequest, CompleteBuildResult } from './types.ts'

test('serializes build and bootstrap commands before activating each epoch', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const completeBuildResults$ = new Subject<CompleteBuildResult>()
    const bootstrapWriteResults$ = new Subject<BootstrapWriteResult>()
    const values: BuildFlowValue[] = []
    const subscription = createBuildFlow$({
        bootstrapWriteResults$,
        buildRequests$,
        completeBuildResults$
    }).subscribe((value) => values.push(value))

    buildRequests$.next(request('build-1', 'initial'))
    buildRequests$.next(request('build-2', 'client-changed'))
    assert.deepEqual(values, [{ kind: 'run-build', request: request('build-1', 'initial') }])

    completeBuildResults$.next({ buildId: 'build-1', ok: true })
    assert.deepEqual(values.at(-1), { epoch: { buildId: 'build-1' }, kind: 'write-bootstrap' })

    bootstrapWriteResults$.next({ buildId: 'build-1', ok: true })
    assert.deepEqual(values.slice(-2), [
        { epoch: { buildId: 'build-1' }, kind: 'epoch-ready' },
        { kind: 'run-build', request: request('build-2', 'client-changed') }
    ])

    completeBuildResults$.next({ buildId: 'build-2', ok: true })
    bootstrapWriteResults$.next({ buildId: 'build-2', ok: true })
    assert.deepEqual(values.at(-1), { epoch: { buildId: 'build-2' }, kind: 'epoch-ready' })

    subscription.unsubscribe()
})

test('a failed complete build skips bootstrap and advances to the next queued request', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const completeBuildResults$ = new Subject<CompleteBuildResult>()
    const bootstrapWriteResults$ = new Subject<BootstrapWriteResult>()
    const values: BuildFlowValue[] = []
    const subscription = createBuildFlow$({
        bootstrapWriteResults$,
        buildRequests$,
        completeBuildResults$
    }).subscribe((value) => values.push(value))

    buildRequests$.next(request('failed', 'native-output-changed'))
    buildRequests$.next(request('recovered', 'native-output-changed'))
    completeBuildResults$.next({ buildId: 'failed', error: new Error('output failed'), ok: false })

    assert.deepEqual(values, [
        { kind: 'run-build', request: request('failed', 'native-output-changed') },
        { kind: 'run-build', request: request('recovered', 'native-output-changed') }
    ])

    subscription.unsubscribe()
})

test('a failed bootstrap skips epoch activation and advances to the next queued request', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const completeBuildResults$ = new Subject<CompleteBuildResult>()
    const bootstrapWriteResults$ = new Subject<BootstrapWriteResult>()
    const values: BuildFlowValue[] = []
    const subscription = createBuildFlow$({
        bootstrapWriteResults$,
        buildRequests$,
        completeBuildResults$
    }).subscribe((value) => values.push(value))

    buildRequests$.next(request('bootstrap-failed', 'initial'))
    buildRequests$.next(request('recovered', 'initial'))
    completeBuildResults$.next({ buildId: 'bootstrap-failed', ok: true })
    bootstrapWriteResults$.next({ buildId: 'bootstrap-failed', error: new Error('write failed'), ok: false })

    assert.deepEqual(values.at(-1), { kind: 'run-build', request: request('recovered', 'initial') })
    assert.equal(
        values.some((value) => value.kind === 'epoch-ready'),
        false
    )

    subscription.unsubscribe()
})

test('captures synchronous result feedback produced while commands are consumed', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const completeBuildResults$ = new Subject<CompleteBuildResult>()
    const bootstrapWriteResults$ = new Subject<BootstrapWriteResult>()
    const values: BuildFlowValue[] = []
    const subscription = createBuildFlow$({
        bootstrapWriteResults$,
        buildRequests$,
        completeBuildResults$
    }).subscribe((value) => {
        values.push(value)
        if (value.kind === 'run-build') {
            completeBuildResults$.next({ buildId: value.request.buildId, ok: true })
        } else if (value.kind === 'write-bootstrap') {
            bootstrapWriteResults$.next({ buildId: value.epoch.buildId, ok: true })
        }
    })

    buildRequests$.next(request('build-1', 'initial'))

    assert.deepEqual(
        values.map(({ kind }) => kind),
        ['run-build', 'write-bootstrap', 'epoch-ready']
    )
    subscription.unsubscribe()
})

test('ignores operation results for unrelated build IDs', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const completeBuildResults$ = new Subject<CompleteBuildResult>()
    const bootstrapWriteResults$ = new Subject<BootstrapWriteResult>()
    const values: BuildFlowValue[] = []
    const subscription = createBuildFlow$({
        bootstrapWriteResults$,
        buildRequests$,
        completeBuildResults$
    }).subscribe((value) => values.push(value))

    buildRequests$.next(request('build-1', 'initial'))
    completeBuildResults$.next({ buildId: 'stale', ok: true })
    assert.equal(values.length, 1)

    completeBuildResults$.next({ buildId: 'build-1', ok: true })
    bootstrapWriteResults$.next({ buildId: 'stale', ok: true })
    assert.equal(values.at(-1)?.kind, 'write-bootstrap')

    subscription.unsubscribe()
})

function request(buildId: string, reason: BuildRequest['reason']): BuildRequest {
    return { buildId, reason }
}
