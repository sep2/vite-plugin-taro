import assert from 'node:assert/strict'
import test from 'node:test'
import type { HostPatch } from './hmr-files.ts'
import { PatchPublisher } from './patch-publisher.ts'

const patch = (code: string): HostPatch => ({ code, fileName: 'pages/a/index.js' })

/** Resolves after pending microtasks and the voided publishIfBehind chain. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

function createPublisher(): { publisher: PatchPublisher; writes: string[] } {
    const writes: string[] = []
    const publisher = new PatchPublisher(async (content) => {
        writes.push(content)
    })
    return { publisher, writes }
}

test('before any build no report is current and nothing is published', async () => {
    const { publisher, writes } = createPublisher()

    assert.equal(publisher.isCurrentBuild('anything'), false)
    assert.equal(publisher.report(0), false)
    publisher.produce([patch('p1')])

    await flush()
    assert.equal(writes.length, 0)
})

test('each produce writes only the missing suffix from the reported version', async () => {
    const { publisher, writes } = createPublisher()
    publisher.startBuild()
    publisher.report(0)

    publisher.produce([patch('p1'), patch('p2')])
    await flush()
    assert.equal(writes.length, 1)
    assert.match(writes[0], /storePatches/)
    assert.match(writes[0], /version: 1/)
    assert.match(writes[0], /version: 2/)

    // The runtime stored the suffix and reported the new position: the next batch writes
    // only its own missing suffix.
    publisher.report(2)
    publisher.produce([patch('p3')])
    await flush()
    assert.equal(writes.length, 2)
    assert.match(writes[1], /version: 3/)
    assert.doesNotMatch(writes[1], /p2/)
})

test('a report at the patch count publishes nothing', async () => {
    const { publisher, writes } = createPublisher()
    publisher.startBuild()
    publisher.produce([patch('p1')])
    await flush()
    assert.equal(writes.length, 1)

    publisher.report(1)
    await flush()
    assert.equal(writes.length, 1)
})

test('the reported version advances the write suffix', async () => {
    const { publisher, writes } = createPublisher()
    publisher.startBuild()
    publisher.report(1)
    publisher.produce([patch('p1'), patch('p2'), patch('p3')])

    await flush()
    assert.equal(writes.length, 1)
    assert.doesNotMatch(writes[0], /p1/)
    assert.match(writes[0], /p2/)
    assert.match(writes[0], /p3/)
    assert.doesNotMatch(writes[0], /version: 1/)
    assert.match(writes[0], /version: 2/)
    assert.match(writes[0], /version: 3/)
})

test('a report behind the patch count re-publishes the missing suffix', async () => {
    const { publisher, writes } = createPublisher()
    publisher.startBuild()
    publisher.produce([patch('p1'), patch('p2')])
    await flush()
    assert.equal(writes.length, 1)

    // A delayed report from before the store: the host re-publishes what the runtime
    // has not acknowledged yet. Storing is idempotent, so this only costs a refresh.
    assert.equal(publisher.report(0), false)
    await flush()
    assert.equal(writes.length, 2)
    assert.match(writes[1], /version: 1/)
    assert.match(writes[1], /version: 2/)
})

test('a backward report flags a fresh App heap', async () => {
    const { publisher, writes } = createPublisher()
    publisher.startBuild()
    publisher.produce([patch('p1'), patch('p2')])
    assert.equal(publisher.report(2), false)
    await flush()
    assert.equal(writes.length, 1)

    // The runtime restarted and starts at zero: the report is a restart signal, not a
    // catch-up position.
    assert.equal(publisher.report(0), true)
})

test('startBuild resets the history and the reported version', async () => {
    const { publisher, writes } = createPublisher()
    const b1 = publisher.startBuild()
    assert.equal(publisher.isCurrentBuild(b1), true)

    publisher.report(0)
    publisher.produce([patch('p1')])
    await flush()
    assert.equal(writes.length, 1)

    const b2 = publisher.startBuild()
    assert.equal(publisher.isCurrentBuild(b1), false)
    assert.equal(publisher.isCurrentBuild(b2), true)

    // The history and position were reset: the same produce publishes exactly once.
    publisher.report(0)
    publisher.produce([patch('p1')])
    await flush()
    assert.equal(writes.length, 2)
})

test('an empty batch is a no-op', async () => {
    const { publisher, writes } = createPublisher()
    publisher.startBuild()
    publisher.report(0)
    publisher.produce([])

    await flush()
    assert.equal(writes.length, 0)
})
