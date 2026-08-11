import assert from 'node:assert/strict'
import test from 'node:test'
import type { DevOptions } from 'rolldown/experimental'
import { VirtualTimeScheduler } from 'rxjs'
import { createHmrResultsStream } from './create-hmr-results-stream.ts'
import type { PatchUpdate } from './hmr-files.ts'

type HmrUpdatesResult = Parameters<NonNullable<DevOptions['onHmrUpdates']>>[0]
type HmrUpdates = Exclude<HmrUpdatesResult, Error>

const settleMilliseconds = 32

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
    scheduler: VirtualTimeScheduler
    stream: ReturnType<typeof createHmrResultsStream>
}> {
    // These mutable journals expose stream effects after deterministic virtual-time scheduling.
    const publications: HmrUpdates[] = []
    const failures: Error[] = []
    const scheduler = new VirtualTimeScheduler()
    const stream = createHmrResultsStream(
        settleMilliseconds,
        scheduler,
        (update) => {
            publications.push(update)
        },
        (error) => {
            failures.push(error)
        }
    )
    return { failures: failures, publications: publications, scheduler: scheduler, stream: stream }
}

test('coalesces a quiet HMR window without losing callback order', () => {
    // Eight virtual milliseconds stays within the 32 ms trailing edge; callback arrays are concatenated without interpretation.
    const { failures, publications, scheduler, stream } = createProbe()
    stream.next(result(1, ['/src/a.ts']))
    scheduler.schedule(() => stream.next(result(2, ['/src/a.ts', '/src/b.ts'])), 8)

    scheduler.flush()

    assert.deepEqual(
        publications[0]?.updates.map(({ update }) => (update.type === 'Patch' ? update.seq : undefined)),
        [1, 2]
    )
    assert.deepEqual(publications[0]?.changedFiles, ['/src/a.ts', '/src/a.ts', '/src/b.ts'])
    assert.equal(publications.length, 1)
    assert.deepEqual(failures, [])
    stream.complete()
})

test('keeps edits outside the quiet window as separate publications', () => {
    // Advancing beyond the exact settle duration proves ordinary paced saves preserve separate interactive transactions.
    const { publications, scheduler, stream } = createProbe()
    scheduler.schedule(() => stream.next(result(1, ['/src/a.ts'])), 0)
    scheduler.schedule(() => stream.next(result(2, ['/src/b.ts'])), settleMilliseconds + 8)

    scheduler.flush()

    assert.deepEqual(
        publications.map(({ updates }) =>
            updates.map(({ update }) => (update.type === 'Patch' ? update.seq : undefined))
        ),
        [[1], [2]]
    )
    stream.complete()
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
