import assert from 'node:assert/strict'
import test from 'node:test'
import { of, Subject } from 'rxjs'
import { createBootstrap$ } from './startup.ts'
import type { Bootstrap } from './types.ts'

test('publishes bootstrap only after preparation, first engine output, and Vite listening', () => {
    const prepareOutput$ = new Subject<void>()
    const initialEngineOutput$ = new Subject<void>()
    const listeningEndpoint$ = new Subject<string>()
    const writes: Bootstrap[] = []
    const values: Bootstrap[] = []
    const bootstrap$ = createBootstrap$({
        buildId: 'build-1',
        prepareOutput$,
        initialEngineOutput$,
        listeningEndpoint$,
        writeBootstrap(bootstrap) {
            writes.push(bootstrap)
            return of(undefined)
        }
    })
    const subscription = bootstrap$.subscribe((bootstrap) => values.push(bootstrap))

    prepareOutput$.next()
    initialEngineOutput$.next()
    assert.deepEqual(values, [])

    listeningEndpoint$.next('http://127.0.0.1:5174/__vpt_hmr__')
    assert.deepEqual(values, [{ buildId: 'build-1', endpoint: 'http://127.0.0.1:5174/__vpt_hmr__' }])
    assert.deepEqual(writes, values)

    const lateValues: Bootstrap[] = []
    const lateSubscription = bootstrap$.subscribe((bootstrap) => lateValues.push(bootstrap))
    assert.deepEqual(lateValues, values)

    lateSubscription.unsubscribe()
    subscription.unsubscribe()
})
