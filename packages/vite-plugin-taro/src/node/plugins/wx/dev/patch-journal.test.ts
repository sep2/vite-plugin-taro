import assert from 'node:assert/strict'
import test from 'node:test'
import type { PatchPublication, PatchUpdate } from './hmr-protocol.ts'
import { PatchJournal } from './patch-journal.ts'

const patch = (seq: number, code: string): PatchUpdate => ({
    type: 'Patch',
    code: code,
    filename: 'pages/a/index.js',
    changedIds: ['pages/a/index'],
    seq: seq
})

function snapshot(publication: PatchPublication): PatchPublication {
    return {
        buildId: publication.buildId,
        patches: [...publication.patches]
    }
}

function createJournal(): { journal: PatchJournal; publications: PatchPublication[] } {
    // This mutable journal snapshots each publication before later ACKs can change the source journal.
    const publications: PatchPublication[] = []
    const journal = new PatchJournal(async (publication) => {
        publications.push(snapshot(publication))
    })
    return { journal: journal, publications: publications }
}

test('before any build no session is current and nothing is published', async () => {
    const { journal, publications } = createJournal()

    assert.equal(journal.current(), undefined)
    assert.equal(journal.isCurrentBuild('anything'), false)
    journal.acknowledge(0)
    await journal.produce([patch(1, 'p1')])

    assert.equal(publications.length, 0)
})

test('publishes the current build identity and only the unacknowledged sequence', async () => {
    const { journal, publications } = createJournal()
    const { buildId } = journal.startBuild()

    await journal.produce([patch(1, 'p1'), patch(2, 'p2')])
    assert.equal(publications[0]?.buildId, buildId)
    assert.deepEqual(
        publications[0]?.patches.map(({ seq }) => seq),
        [1, 2]
    )

    journal.acknowledge(2)
    await journal.produce([patch(3, 'p3')])
    assert.deepEqual(
        publications[1]?.patches.map(({ seq }) => seq),
        [3]
    )
})

test('retains a patch after failed delivery and republishes it with the next generation', async () => {
    // This mutable journal records every attempted publication, including the failed one.
    const attempts: PatchPublication[] = []
    // This one-shot mutable fault models selected-mode delivery failing before publication becomes durable.
    let publishError: Error | undefined = new Error('delivery unavailable')
    const journal = new PatchJournal(async (publication) => {
        attempts.push(snapshot(publication))
        if (publishError) {
            const error = publishError
            publishError = undefined
            throw error
        }
    })
    journal.startBuild()

    await assert.rejects(() => journal.produce([patch(1, 'p1')]), /delivery unavailable/)
    await journal.produce([patch(2, 'p2')])

    assert.deepEqual(
        attempts.map(({ patches }) => patches.map(({ seq }) => seq)),
        [[1], [1, 2]]
    )
})

test('retains an unacknowledged suffix across later edits', async () => {
    const { journal, publications } = createJournal()
    journal.startBuild()
    await journal.produce([patch(1, 'p1'), patch(2, 'p2'), patch(3, 'p3')])

    journal.acknowledge(1)
    await journal.produce([patch(4, 'p4')])

    assert.deepEqual(
        publications[1]?.patches.map(({ seq }) => seq),
        [2, 3, 4]
    )
})

test('application acknowledgements prune only their covered prefix', async () => {
    const { journal, publications } = createJournal()
    journal.startBuild()
    await journal.produce([patch(1, 'p1'), patch(2, 'p2')])

    journal.acknowledge(1)
    await journal.produce([patch(3, 'p3')])
    assert.deepEqual(
        publications[1]?.patches.map(({ seq }) => seq),
        [2, 3]
    )

    journal.acknowledge(2)
    journal.acknowledge(1)
    await journal.produce([patch(4, 'p4')])
    assert.deepEqual(
        publications[2]?.patches.map(({ seq }) => seq),
        [3, 4]
    )
})

test('a fresh build restarts the Rolldown sequence', async () => {
    const { journal, publications } = createJournal()
    const { buildId: firstBuild } = journal.startBuild()
    await journal.produce([patch(1, 'p1')])

    const { buildId: secondBuild } = journal.startBuild()
    assert.equal(journal.isCurrentBuild(firstBuild), false)
    assert.equal(journal.isCurrentBuild(secondBuild), true)

    await journal.produce([patch(1, 'p1')])
    assert.equal(publications.length, 2)
    assert.equal(publications[1]?.buildId, secondBuild)
    assert.deepEqual(
        publications[1]?.patches.map(({ seq }) => seq),
        [1]
    )
})
