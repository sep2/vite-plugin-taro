import assert from 'node:assert/strict'
import test from 'node:test'
import type { PatchUpdate } from './hmr-files.ts'
import { PatchPublisher } from './patch-publisher.ts'

const patch = (seq: number, code: string): PatchUpdate => ({
    type: 'Patch',
    code,
    filename: 'pages/a/index.js',
    changedIds: ['pages/a/index'],
    seq
})

function createPublisher(): { publisher: PatchPublisher; writes: string[] } {
    const writes: string[] = []
    const publisher = new PatchPublisher(async (content) => {
        writes.push(content)
    })
    return { publisher, writes }
}

test('before any build no session is current and nothing is published', async () => {
    const { publisher, writes } = createPublisher()

    assert.equal(publisher.isCurrentBuild('anything'), false)
    publisher.acknowledge(0)
    await publisher.produce([patch(1, 'p1')])

    assert.equal(writes.length, 0)
})

test('publishes only the unacknowledged Rolldown sequence', async () => {
    const { publisher, writes } = createPublisher()
    publisher.startBuild()

    await publisher.produce([patch(1, 'p1'), patch(2, 'p2')])
    assert.match(writes[0], /seq: 1/)
    assert.match(writes[0], /seq: 2/)

    publisher.acknowledge(2)
    await publisher.produce([patch(3, 'p3')])
    assert.equal(writes.length, 2)
    assert.match(writes[1], /seq: 3/)
    assert.doesNotMatch(writes[1], /p2/)
})

test('retains a patch after a failed physical write and republishes it with the next generation', async () => {
    // This mutable journal records every attempted physical generation, including the failed one.
    const attempts: string[] = []
    // This one-shot mutable fault models an atomic filesystem write failing before publication becomes durable.
    let writeError: Error | undefined = new Error('disk unavailable')
    const publisher = new PatchPublisher(async (content) => {
        attempts.push(content)
        if (writeError) {
            const error = writeError
            writeError = undefined
            throw error
        }
    })
    publisher.startBuild()

    await assert.rejects(() => publisher.produce([patch(1, 'p1')]), /disk unavailable/)
    await publisher.produce([patch(2, 'p2')])

    assert.equal(attempts.length, 2)
    assert.match(attempts[1], /seq: 1/)
    assert.match(attempts[1], /p1/)
    assert.match(attempts[1], /seq: 2/)
    assert.match(attempts[1], /p2/)
    assert.equal((attempts[1].match(/seq: 1/g) ?? []).length, 1)
})

test('retains an unacknowledged suffix across later edits', async () => {
    const { publisher, writes } = createPublisher()
    publisher.startBuild()
    await publisher.produce([patch(1, 'p1'), patch(2, 'p2'), patch(3, 'p3')])

    publisher.acknowledge(1)
    await publisher.produce([patch(4, 'p4')])

    assert.doesNotMatch(writes[1], /p1/)
    assert.match(writes[1], /p2/)
    assert.match(writes[1], /p3/)
    assert.match(writes[1], /p4/)
})

test('application acknowledgements prune only their covered prefix', async () => {
    const { publisher, writes } = createPublisher()
    publisher.startBuild()
    await publisher.produce([patch(1, 'p1'), patch(2, 'p2')])

    publisher.acknowledge(1)
    await publisher.produce([patch(3, 'p3')])
    assert.doesNotMatch(writes[1], /p1/)
    assert.match(writes[1], /p2/)
    assert.match(writes[1], /p3/)

    publisher.acknowledge(2)
    publisher.acknowledge(1)
    await publisher.produce([patch(4, 'p4')])
    assert.doesNotMatch(writes[2], /p2/)
    assert.match(writes[2], /p3/)
    assert.match(writes[2], /p4/)
})

test('a fresh build restarts the Rolldown sequence', async () => {
    const { publisher, writes } = createPublisher()
    const { buildId: firstBuild } = publisher.startBuild()
    await publisher.produce([patch(1, 'p1')])

    const { buildId: secondBuild } = publisher.startBuild()
    assert.equal(publisher.isCurrentBuild(firstBuild), false)
    assert.equal(publisher.isCurrentBuild(secondBuild), true)

    await publisher.produce([patch(1, 'p1')])
    assert.equal(writes.length, 2)
})
