import assert from 'node:assert/strict'
import test from 'node:test'
import type { DevOptions } from 'rolldown/experimental'
import { VirtualTimeScheduler } from 'rxjs'
import { createHmrResultsStream } from './create-hmr-results-stream.ts'
import type { PatchUpdate } from './hmr-protocol.ts'

type HmrUpdatesResult = Parameters<NonNullable<DevOptions['onHmrUpdates']>>[0]
type HmrUpdates = Exclude<HmrUpdatesResult, Error>

const batchMilliseconds = 16

function patch(seq: number): PatchUpdate {
    return {
        type: 'Patch',
        code: `patch-${seq}`,
        filename: `patch-${seq}.js`,
        changedIds: [`module-${seq}`],
        seq: seq
    }
}

function result(seq: number, changedFiles: string[]): HmrUpdates {
    return {
        updates: [{ clientId: 'client', update: patch(seq) }],
        changedFiles: changedFiles
    }
}

function createProbe(): Readonly<{
    failures: Error[]
    publications: HmrUpdates[]
    publicationFrames: number[]
    scheduler: VirtualTimeScheduler
    stream: ReturnType<typeof createHmrResultsStream>
}> {
    // These mutable journals expose stream effects after deterministic virtual-time scheduling.
    const publications: HmrUpdates[] = []
    const publicationFrames: number[] = []
    const failures: Error[] = []
    const scheduler = new VirtualTimeScheduler()
    const stream = createHmrResultsStream(
        batchMilliseconds,
        scheduler,
        (update) => {
            publications.push(update)
            publicationFrames.push(scheduler.frame)
        },
        (error) => {
            failures.push(error)
        }
    )
    return { failures, publications, publicationFrames, scheduler, stream }
}

test('coalesces a 16 ms HMR window without losing callback order', () => {
    // The second callback joins the first window without postponing its original deadline.
    const { failures, publications, publicationFrames, scheduler, stream } = createProbe()
    stream.next(result(1, ['/src/a.ts']))
    scheduler.schedule(() => stream.next(result(2, ['/src/a.ts', '/src/b.ts'])), 8)

    scheduler.flush()

    assert.deepEqual(
        publications[0]?.updates.map(({ update }) => (update.type === 'Patch' ? update.seq : undefined)),
        [1, 2]
    )
    assert.deepEqual(publications[0]?.changedFiles, ['/src/a.ts', '/src/a.ts', '/src/b.ts'])
    assert.deepEqual(publicationFrames, [batchMilliseconds])
    assert.equal(scheduler.frame, batchMilliseconds)
    assert.equal(publications.length, 1)
    assert.deepEqual(failures, [])
    stream.complete()
})

test('empty and Noop-only callbacks neither schedule nor publish work', () => {
    const { failures, publications, scheduler, stream } = createProbe()
    stream.next({ updates: [], changedFiles: ['/src/empty.ts'] })
    stream.next({
        updates: [
            { clientId: 'client', update: { type: 'Noop' } },
            { clientId: 'other-client', update: { type: 'Noop' } }
        ],
        changedFiles: ['/src/noop.ts']
    })

    scheduler.flush()
    stream.complete()

    assert.equal(scheduler.frame, 0)
    assert.deepEqual(publications, [])
    assert.deepEqual(failures, [])
})

test('publishes every patch at the first meaningful deadline despite repeated Noop callbacks', () => {
    const { failures, publications, scheduler, stream } = createProbe()
    const first = result(1, ['/src/a.ts'])
    const second = result(2, ['/src/b.ts'])
    stream.next(first)
    scheduler.schedule(() => stream.next(second), 8)
    for (const frame of [4, 12, 20, 28, 36]) {
        scheduler.schedule(
            () =>
                stream.next({
                    updates: [{ clientId: 'client', update: { type: 'Noop' } }],
                    changedFiles: ['/src/noop.ts']
                }),
            frame
        )
    }

    // Advance the virtual clock around the first real callback's deadline, then drain later no-ops separately.
    scheduler.maxFrames = batchMilliseconds - 1
    scheduler.flush()
    assert.deepEqual(publications, [])
    scheduler.maxFrames++
    scheduler.flush()
    assert.equal(scheduler.frame, batchMilliseconds)
    assert.deepEqual(publications, [
        { updates: [...first.updates, ...second.updates], changedFiles: ['/src/a.ts', '/src/b.ts'] }
    ])

    scheduler.maxFrames = Infinity
    scheduler.flush()
    stream.complete()
    assert.equal(publications.length, 1)
    assert.deepEqual(failures, [])
})

test('preserves mixed callbacks containing patches, Noops, and full reloads unchanged', () => {
    const { publications, scheduler, stream } = createProbe()
    const mixed: HmrUpdates = {
        updates: [
            { clientId: 'client', update: { type: 'Noop' } },
            { clientId: 'client', update: patch(1) }
        ],
        changedFiles: ['/src/a.ts']
    }
    const reload: HmrUpdates = {
        updates: [{ clientId: 'client', update: { type: 'FullReload' } }],
        changedFiles: ['/src/app.config.ts']
    }
    stream.next(mixed)
    scheduler.flush()
    stream.next(reload)
    scheduler.flush()
    stream.complete()

    assert.deepEqual(publications, [mixed, reload])
})

test('Noop callbacks do not postpone a pending diagnostic', () => {
    const { failures, publications, scheduler, stream } = createProbe()
    const failure = new Error('broken update')
    stream.next(failure)
    scheduler.schedule(
        () => stream.next({ updates: [{ clientId: 'client', update: { type: 'Noop' } }], changedFiles: [] }),
        8
    )

    // Stop exactly at the error's original deadline to prove no-ops leave diagnostic admission unchanged.
    scheduler.maxFrames = batchMilliseconds
    scheduler.flush()
    assert.deepEqual(failures, [failure])
    assert.deepEqual(publications, [])
    stream.complete()
})

test('starts a fresh 16 ms window after an idle gap', () => {
    // The next callback starts its own deadline rather than inheriting an idle periodic timer.
    const { publications, publicationFrames, scheduler, stream } = createProbe()
    scheduler.schedule(() => stream.next(result(1, ['/src/a.ts'])), 0)
    scheduler.schedule(() => stream.next(result(2, ['/src/b.ts'])), batchMilliseconds + 8)

    scheduler.flush()

    assert.deepEqual(
        publications.map(({ updates }) =>
            updates.map(({ update }) => (update.type === 'Patch' ? update.seq : undefined))
        ),
        [[1], [2]]
    )
    assert.deepEqual(publicationFrames, [batchMilliseconds, 2 * batchMilliseconds + 8])
    assert.equal(scheduler.frame, 2 * batchMilliseconds + 8)
    stream.complete()
})

test('flushes sustained traffic in 16 ms windows without losing or reordering patches', () => {
    const { failures, publications, publicationFrames, scheduler, stream } = createProbe()
    const updates = Array.from({ length: 18 }, (_, index) => result(index + 1, [`/src/module-${index}.ts`]))
    updates.forEach((update, index) => {
        scheduler.schedule(() => stream.next(update), index * 10)
    })

    scheduler.flush()
    stream.complete()

    // Each pair arrives 10 ms apart; later callbacks cannot move the deadline set by the first callback of each pair.
    assert.deepEqual(
        publicationFrames,
        Array.from({ length: 9 }, (_, index) => index * 20 + batchMilliseconds)
    )
    assert.deepEqual(
        publications.map(({ updates }) => updates.length),
        Array.from({ length: 9 }, () => 2)
    )
    assert.deepEqual(
        publications.flatMap(({ updates }) => updates),
        updates.flatMap(({ updates }) => updates)
    )
    assert.deepEqual(
        publications.flatMap(({ changedFiles }) => changedFiles),
        updates.flatMap(({ changedFiles }) => changedFiles)
    )
    assert.equal(scheduler.frame, 160 + batchMilliseconds)
    assert.deepEqual(failures, [])
})

test('reports the latest error at 16 ms during a continuous parser burst', () => {
    const { failures, publications, scheduler, stream } = createProbe()
    const errors = Array.from({ length: 7 }, (_, index) => new Error(`invalid generation ${index}`))
    errors.forEach((error, index) => {
        scheduler.schedule(() => stream.next(error), index * 2)
    })

    // Inspect both sides of the deadline, then drain the scheduler to prove no timer remains while idle.
    scheduler.maxFrames = batchMilliseconds - 1
    scheduler.flush()
    assert.deepEqual(failures, [])
    scheduler.maxFrames = batchMilliseconds
    scheduler.flush()
    assert.deepEqual(failures, [errors.at(-1)])
    assert.deepEqual(publications, [])
    scheduler.maxFrames = Infinity
    scheduler.flush()
    assert.equal(scheduler.frame, batchMilliseconds)
    stream.complete()
})

test('flushes a pending window immediately on shutdown after an earlier timed publication', () => {
    const { publications, publicationFrames, scheduler, stream } = createProbe()
    for (const [index, frame] of [0, 4, 8, 12, 20].entries()) {
        scheduler.schedule(() => stream.next(result(index + 1, [])), frame)
    }
    scheduler.schedule(() => stream.complete(), 24)

    scheduler.flush()

    assert.deepEqual(publicationFrames, [batchMilliseconds, 24])
    assert.deepEqual(
        publications.map(({ updates }) => updates.map(({ update }) => update.type === 'Patch' && update.seq)),
        [[1, 2, 3, 4], [5]]
    )
    assert.equal(scheduler.frame, 24)
})

test('ignores an error-only editor generation and accepts the next healthy update', () => {
    // Syntax errors carry no payload and must not start a complete build or terminate the stream used by the corrected save.
    const { failures, publications, scheduler, stream } = createProbe()
    const failure = new Error('broken update')
    stream.next(failure)
    scheduler.flush()
    assert.equal(publications.length, 0)
    assert.deepEqual(failures, [failure])

    stream.next(result(1, ['/src/recovered.ts']))
    scheduler.flush()
    assert.equal(publications.length, 1)
    stream.complete()
})

test('retains a large successful patch range around a transient failure', () => {
    // The failed callback itself contributes no factory. Every successful callback still does, so filtering the error must not
    // create a sequence hole between valid editor generations on either side of it.
    const { failures, publications, scheduler, stream } = createProbe()
    const failure = new Error('pressure-window transform failure')
    for (let seq = 1; seq <= 2_500; seq++) {
        stream.next(result(seq, [`/src/module-${seq}.ts`]))
    }
    stream.next(failure)
    for (let seq = 2_501; seq <= 5_000; seq++) {
        stream.next(result(seq, [`/src/module-${seq}.ts`]))
    }

    scheduler.flush()

    assert.equal(publications.length, 1)
    assert.equal(publications[0]?.updates.length, 5_000)
    assert.deepEqual(failures, [failure])
    stream.complete()
})

test('retains a large burst in one bounded publication without reordering', () => {
    // Five thousand callbacks greatly exceed the DevTools fixture. Every factory remains lossless because later callbacks do
    // not reproduce earlier module generations.
    const { failures, publications, scheduler, stream } = createProbe()
    const updateCount = 5_000
    const changedFileCount = 19
    for (let seq = 1; seq <= updateCount; seq++) {
        stream.next(result(seq, [`/src/source-${seq % changedFileCount}.ts`]))
    }

    scheduler.flush()

    assert.equal(publications.length, 1)
    const publication = publications[0]
    if (!publication) {
        throw new Error('Expected one pressure-test publication')
    }
    assert.equal(publication.updates.length, updateCount)
    const firstUpdate = publication.updates[0]?.update
    const lastUpdate = publication.updates.at(-1)?.update
    assert.equal(firstUpdate?.type === 'Patch' ? firstUpdate.seq : 0, 1)
    assert.equal(lastUpdate?.type === 'Patch' ? lastUpdate.seq : 0, updateCount)
    assert.deepEqual(failures, [])
    stream.complete()
})

test('flushes an admitted window when the host completes the stream', () => {
    // Shutdown does not advance virtual time. Publication therefore proves Subject completion itself closes the active buffer.
    const { failures, publications, stream } = createProbe()
    stream.next(result(1, ['/src/a.ts']))

    stream.complete()

    assert.equal(publications.length, 1)
    assert.deepEqual(failures, [])
})
