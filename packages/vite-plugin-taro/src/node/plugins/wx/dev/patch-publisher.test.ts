import assert from 'node:assert/strict'
import test from 'node:test'
import type { PatchUpdate } from './hmr-files.ts'
import { PatchPublisher } from './patch-publisher.ts'

const patch = (code: string, fileName?: string): PatchUpdate => ({
    type: 'Patch',
    code,
    filename: fileName ?? 'pages/a/index.js',
    changedIds: ['pages/a/index'],
    seq: 0
})

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
    publisher.report(0)
    await publisher.produce([patch('p1')])

    assert.equal(writes.length, 0)
})

test('each produce writes only the missing suffix from the reported version', async () => {
    const { publisher, writes } = createPublisher()
    publisher.startBuild()

    await publisher.produce([patch('p1'), patch('p2')])
    assert.equal(writes.length, 1)
    assert.match(writes[0], /version: 1/)
    assert.match(writes[0], /version: 2/)

    publisher.report(2)
    await publisher.produce([patch('p3')])
    assert.equal(writes.length, 2)
    assert.match(writes[1], /version: 3/)
    assert.doesNotMatch(writes[1], /p2/)
})

test('a partial delivery advances the next write suffix', async () => {
    const { publisher, writes } = createPublisher()
    publisher.startBuild()
    await publisher.produce([patch('p1'), patch('p2'), patch('p3')])

    publisher.report(1)
    await publisher.produce([patch('p4')])

    assert.equal(writes.length, 2)
    assert.doesNotMatch(writes[1], /p1/)
    assert.match(writes[1], /p2/)
    assert.match(writes[1], /p3/)
    assert.match(writes[1], /p4/)
})

test('reports return each newly delivered Rolldown filename once', async () => {
    const { publisher } = createPublisher()
    publisher.startBuild()
    await publisher.produce([patch('p1', 'patch-1.js'), patch('p2', 'patch-2.js')])

    assert.deepEqual(publisher.report(1), ['patch-1.js'])
    assert.deepEqual(publisher.report(2), ['patch-2.js'])
    assert.deepEqual(publisher.report(1), [])
})

test('rejects reports outside the current patch history', () => {
    const { publisher } = createPublisher()
    publisher.startBuild()

    assert.throws(() => publisher.report(-1), /invalid WX patch version/)
    assert.throws(() => publisher.report(1), /invalid WX patch version/)
})

test('startBuild resets the history and the reported version', async () => {
    const { publisher, writes } = createPublisher()
    const { buildId: firstBuild } = publisher.startBuild()
    await publisher.produce([patch('p1')])

    const { buildId: secondBuild } = publisher.startBuild()
    assert.equal(publisher.isCurrentBuild(firstBuild), false)
    assert.equal(publisher.isCurrentBuild(secondBuild), true)

    await publisher.produce([patch('p1')])
    assert.equal(writes.length, 2)
})
