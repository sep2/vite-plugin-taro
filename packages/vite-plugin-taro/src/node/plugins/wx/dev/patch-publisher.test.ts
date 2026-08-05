import assert from 'node:assert/strict'
import test from 'node:test'
import type { PatchUpdate } from './hmr-files.ts'
import { PatchPublisher } from './patch-publisher.ts'

const patch = (seq: number, code: string, fileName?: string): PatchUpdate => ({
    type: 'Patch',
    code,
    filename: fileName ?? 'pages/a/index.js',
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

test('before any build no delivery is current and nothing is published', async () => {
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

test('acknowledges each delivered Rolldown filename once', async () => {
    const { publisher } = createPublisher()
    publisher.startBuild()
    await publisher.produce([patch(1, 'p1', 'patch-1.js'), patch(2, 'p2', 'patch-2.js')])

    assert.deepEqual(publisher.acknowledge(1), ['patch-1.js'])
    assert.deepEqual(publisher.acknowledge(2), ['patch-2.js'])
    assert.deepEqual(publisher.acknowledge(1), [])
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
