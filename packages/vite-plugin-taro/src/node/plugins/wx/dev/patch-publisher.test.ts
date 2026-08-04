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

test('before any build no report is current and holds never write', async () => {
    const { publisher, writes } = createPublisher()

    assert.equal(publisher.isCurrentBuild('anything'), false)
    publisher.hold(0, () => {
        assert.fail('a pre-build hold must never be released')
    })

    await flush()
    assert.equal(writes.length, 0)
})

test('a produced batch behind a held report is written once and releases the poll', async () => {
    const { publisher, writes } = createPublisher()
    const b1 = publisher.startBuild()
    assert.equal(publisher.isCurrentBuild(b1), true)

    let released = 0
    publisher.hold(0, () => {
        released++
    })
    publisher.produce([patch('p1'), patch('p2')])

    await flush()
    assert.equal(writes.length, 1)
    assert.match(writes[0], /storePatches/)
    assert.match(writes[0], /version: 1/)
    assert.match(writes[0], /version: 2/)
    assert.equal(released, 1)

    // No held report anymore: a further batch is stored but not written.
    publisher.produce([patch('p3')])
    await flush()
    assert.equal(writes.length, 1)
})

test('a current version report is not published; a behind one is on hold', async () => {
    const { publisher, writes } = createPublisher()
    const b1 = publisher.startBuild()
    assert.equal(publisher.isCurrentBuild(b1), true)
    publisher.produce([patch('p1')])

    let currentReleased = 0
    let behindReleased = 0
    publisher.hold(1, () => {
        currentReleased++
    })
    await flush()
    assert.equal(writes.length, 0)
    assert.equal(currentReleased, 0)

    publisher.hold(0, () => {
        behindReleased++
    })
    await flush()
    assert.equal(writes.length, 1)
    // The new hold superseded the current one, then the publish released the new one.
    assert.equal(currentReleased, 1)
    assert.equal(behindReleased, 1)
})

test('a newer hold releases the previously held report immediately', async () => {
    const { publisher, writes } = createPublisher()
    const b1 = publisher.startBuild()
    assert.equal(publisher.isCurrentBuild(b1), true)

    let firstReleased = 0
    let secondReleased = 0
    publisher.hold(0, () => {
        firstReleased++
    })
    publisher.hold(0, () => {
        secondReleased++
    })
    assert.equal(firstReleased, 1)

    publisher.produce([patch('p1')])
    await flush()
    assert.equal(writes.length, 1)
    assert.equal(secondReleased, 1)
})

test('startBuild resets the history and releases the stale hold', async () => {
    const { publisher, writes } = createPublisher()
    const b1 = publisher.startBuild()
    assert.equal(publisher.isCurrentBuild(b1), true)

    let released = 0
    publisher.hold(0, () => {
        released++
    })
    const b2 = publisher.startBuild()
    assert.equal(released, 1)
    assert.equal(publisher.isCurrentBuild(b1), false)
    assert.equal(publisher.isCurrentBuild(b2), true)

    // The history was reset: the same holds and produces publish exactly once.
    publisher.hold(0, () => {})
    publisher.produce([patch('p1')])
    await flush()
    assert.equal(writes.length, 1)
})

test('an empty batch is a no-op', async () => {
    const { publisher, writes } = createPublisher()
    const b1 = publisher.startBuild()
    assert.equal(publisher.isCurrentBuild(b1), true)
    publisher.hold(0, () => {})
    publisher.produce([])

    await flush()
    assert.equal(writes.length, 0)
})

test('the payload contains only the missing suffix from the held version', async () => {
    const { publisher, writes } = createPublisher()
    const b1 = publisher.startBuild()
    assert.equal(publisher.isCurrentBuild(b1), true)
    publisher.produce([patch('p1'), patch('p2'), patch('p3')])

    publisher.hold(1, () => {})
    await flush()
    assert.equal(writes.length, 1)
    assert.doesNotMatch(writes[0], /p1/)
    assert.match(writes[0], /p2/)
    assert.match(writes[0], /p3/)
    assert.doesNotMatch(writes[0], /version: 1/)
    assert.match(writes[0], /version: 2/)
    assert.match(writes[0], /version: 3/)
})

test('the poll releases only after the write completes', async () => {
    let resolveWrite: () => void = () => {}
    const pendingWrite = new Promise<void>((resolve) => {
        resolveWrite = resolve
    })
    const publisher = new PatchPublisher(() => pendingWrite)
    const b1 = publisher.startBuild()
    assert.equal(publisher.isCurrentBuild(b1), true)

    let released = 0
    publisher.hold(0, () => {
        released++
    })
    publisher.produce([patch('p1')])

    await flush()
    assert.equal(released, 0)

    resolveWrite()
    await flush()
    assert.equal(released, 1)
})
