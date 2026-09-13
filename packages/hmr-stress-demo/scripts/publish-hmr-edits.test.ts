import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { publishHmrEdits } from './publish-hmr-edits.ts'

const baseline = "export const hmrMarker = 'baseline'\nexport const appOutletFirst = true\n"
const profile = { intervalMilliseconds: 1, updateCount: 2 }

test('publication awaits restoration and baseline application', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'hmr-publication-'))
    const file = path.join(root, 'marker.ts')
    // Record the runtime acknowledgements in order, alongside the generation on disk.
    const observed: string[] = []
    try {
        await writeFile(file, baseline)
        await publishHmrEdits(file, profile, async (marker) => {
            assert.ok((await readFile(file, 'utf8')).includes(`hmrMarker = '${marker}'`))
            observed.push(marker)
        })
        assert.deepEqual(observed, ['stress-restoring', 'baseline'])
        assert.equal(await readFile(file, 'utf8'), baseline)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('failed runtime acknowledgement still restores source and fails publication', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'hmr-publication-failure-'))
    const file = path.join(root, 'marker.ts')
    const failure = new Error('Runtime did not apply the restoration')
    try {
        await writeFile(file, baseline)
        await assert.rejects(
            publishHmrEdits(file, profile, async () => {
                throw failure
            }),
            failure
        )
        assert.equal(await readFile(file, 'utf8'), baseline)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
