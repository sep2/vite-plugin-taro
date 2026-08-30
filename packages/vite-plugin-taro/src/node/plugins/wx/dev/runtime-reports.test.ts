import assert from 'node:assert/strict'
import test from 'node:test'
import { VirtualTimeScheduler } from 'rxjs'
import { createHostActions } from './host-actions.ts'
import { createRuntimeReportsStream, type RuntimeReport } from './runtime-reports.ts'

const settleMilliseconds = 32

function applied(buildId: string, seq: number): RuntimeReport {
    return { kind: 'applied', buildId: buildId, seq: seq }
}

function rebuild(buildId: string, reason: string): RuntimeReport {
    return { kind: 'rebuild', buildId: buildId, reason: reason }
}

function createProbe(): Readonly<{
    publications: (readonly RuntimeReport[])[]
    scheduler: VirtualTimeScheduler
    stream: ReturnType<typeof createRuntimeReportsStream>
}> {
    // The publication journal is the only mutable observation point; virtual time makes every quiet edge deterministic.
    const publications: (readonly RuntimeReport[])[] = []
    const scheduler = new VirtualTimeScheduler()
    const stream = createRuntimeReportsStream(settleMilliseconds, scheduler, (reports) => {
        publications.push(reports)
    })
    return { publications: publications, scheduler: scheduler, stream: stream }
}

test('retains only the highest application frontier for each build', () => {
    // Duplicate and out-of-order ACKs are common when multiple retained Pages observe the same cumulative patch file.
    const { publications, scheduler, stream } = createProbe()
    stream.next(applied('build-a', 3))
    stream.next(applied('build-b', 8))
    stream.next(applied('build-a', 2))
    stream.next(applied('build-b', 9))
    stream.next(applied('build-a', 3))

    scheduler.flush()

    assert.deepEqual(publications, [[applied('build-a', 3), applied('build-b', 9)]])
    stream.complete()
})

test('lets rebuild dominate acknowledgements only for its own build', () => {
    // A stale Page's rebuild must remain separately identifiable so the host can discard it without losing the current ACK.
    const { publications, scheduler, stream } = createProbe()
    stream.next(applied('current', 4))
    stream.next(rebuild('stale', 'corrupt stale range'))
    stream.next(rebuild('current', 'missing boundary'))
    stream.next(applied('current', 9))
    stream.next(applied('stale', 12))

    scheduler.flush()

    assert.deepEqual(publications, [[rebuild('current', 'missing boundary'), rebuild('stale', 'corrupt stale range')]])
    stream.complete()
})

test('keeps one rebuild dominant across a large acknowledgement storm', () => {
    // Once recovery is requested, no later Page acknowledgement for that build can revive or prune its failed patch frontier.
    const { publications, scheduler, stream } = createProbe()
    for (let seq = 1; seq <= 5_000; seq++) {
        stream.next(applied('failed-build', seq))
    }
    stream.next(rebuild('failed-build', 'pressure recovery'))
    for (let seq = 5_001; seq <= 10_000; seq++) {
        stream.next(applied('failed-build', seq))
    }

    scheduler.flush()

    assert.deepEqual(publications, [[rebuild('failed-build', 'pressure recovery')]])
    stream.complete()
})

test('bounds a large multi-page acknowledgement burst by build count', () => {
    // Ten thousand receipts model many retained Pages replaying file events. Only the maximum monotonic frontier per build may
    // survive, so reducer memory and downstream PatchJournal work remain independent of raw acknowledgement count.
    const { publications, scheduler, stream } = createProbe()
    const reportCount = 10_000
    const buildCount = 23
    // This independent oracle stores one expected maximum per build while reports arrive in descending sequence order.
    const expectedFrontiers = new Map<string, number>()
    for (let seq = reportCount; seq > 0; seq--) {
        const buildId = `build-${seq % buildCount}`
        if (!expectedFrontiers.has(buildId)) {
            expectedFrontiers.set(buildId, seq)
        }
        stream.next(applied(buildId, seq))
    }

    scheduler.flush()

    assert.equal(publications.length, 1)
    const reports = publications[0]
    if (!reports) {
        throw new Error('Expected one runtime-report pressure publication')
    }
    assert.equal(reports.length, buildCount)
    for (const report of reports) {
        if (report.kind !== 'applied') {
            throw new Error('Expected only application reports')
        }
        assert.equal(report.seq, expectedFrontiers.get(report.buildId))
    }
    stream.complete()
})

test('keeps reports outside the quiet period in separate host transactions', () => {
    const { publications, scheduler, stream } = createProbe()
    scheduler.schedule(() => stream.next(applied('build-a', 1)), 0)
    scheduler.schedule(() => stream.next(applied('build-a', 2)), settleMilliseconds + 4)

    scheduler.flush()

    assert.deepEqual(publications, [[applied('build-a', 1)], [applied('build-a', 2)]])
    stream.complete()
})

test('flushes an admitted report when the host completes the stream', () => {
    const { publications, stream } = createProbe()
    stream.next(applied('build-a', 7))

    stream.complete()

    assert.deepEqual(publications, [[applied('build-a', 7)]])
})

test('serializes a report arriving during physical publication behind that publication', async () => {
    const scheduler = new VirtualTimeScheduler()
    const gate = Promise.withResolvers<void>()
    // This journal models PatchJournal mutation and proves the report callback never bypasses serialized host effects.
    const operations: string[] = []
    const actions = createHostActions<() => void | Promise<void>>(
        (action) => action(),
        () => {}
    )
    actions.next(async () => {
        operations.push('publication:start')
        await gate.promise
        operations.push('publication:end')
    })
    const stream = createRuntimeReportsStream(settleMilliseconds, scheduler, (reports) => {
        actions.next(() => {
            operations.push(`report:${reports[0]?.kind}`)
        })
    })

    stream.next(applied('build-a', 1))
    scheduler.flush()
    await Promise.resolve()
    assert.deepEqual(operations, ['publication:start'])

    gate.resolve()
    await actions.waitForIdle()
    assert.deepEqual(operations, ['publication:start', 'publication:end', 'report:applied'])
    stream.complete()
    await actions.complete()
})
