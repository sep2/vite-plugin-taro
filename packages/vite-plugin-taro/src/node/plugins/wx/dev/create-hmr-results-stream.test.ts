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

test('coalesces a quiet HMR window without losing patch order or changed files', () => {
    // The second callback repeats a.ts deliberately: patches remain lossless, while physical changed-file identities form a
    // first-seen union for future style invalidation. Eight virtual milliseconds stays within the 32 ms trailing edge.
    const { failures, publications, scheduler, stream } = createProbe()
    stream.next(result(1, ['/src/a.ts']))
    scheduler.schedule(() => stream.next(result(2, ['/src/a.ts', '/src/b.ts'])), 8)

    scheduler.flush()

    assert.deepEqual(
        publications[0]?.updates.map(({ update }) => (update.type === 'Patch' ? update.seq : undefined)),
        [1, 2]
    )
    assert.deepEqual(publications[0]?.changedFiles, ['/src/a.ts', '/src/b.ts'])
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

test('lets one HMR error dominate successful patches in the same window', () => {
    // The successful prefix must not escape: its following failed generation can require factories unavailable to the runtime.
    const { failures, publications, scheduler, stream } = createProbe()
    const failure = new Error('broken update')
    stream.next(result(1, ['/src/a.ts']))
    stream.next(failure)

    scheduler.flush()

    assert.deepEqual(publications, [])
    assert.deepEqual(failures, [failure])
    stream.complete()
})

test('retains a large burst in one bounded publication without reordering or file-set growth', () => {
    // Five thousand callbacks greatly exceed the DevTools stress fixture while nineteen repeating paths verify that memory for
    // changed-file classification grows with unique files rather than callback count. Patch entries remain deliberately
    // lossless because every factory may contain a module generation absent from every later callback.
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
    assert.equal(publication.changedFiles.length, changedFileCount)
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
