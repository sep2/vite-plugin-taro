import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { createMemoryTestProject } from '../../../packages/vite-plugin-taro/src/node/tests/create-memory-test-project.ts'
import { publishHmrEdits } from './publish-hmr-edits.ts'

const baseline = "export const hmrMarker = 'baseline'\nexport const appOutletFirst = true\n"
const profile = { intervalMilliseconds: 1, updateCount: 2 }

test('publication awaits restoration and baseline application', async (context) => {
    const root = createMemoryTestProject(context)
    const file = path.join(root, 'marker.ts')
    // Record the runtime acknowledgements in order, alongside the current source generation.
    const observed: string[] = []
    await writeFile(file, baseline)
    await publishHmrEdits(file, profile, async (marker) => {
        assert.ok((await readFile(file, 'utf8')).includes(`hmrMarker = '${marker}'`))
        observed.push(marker)
    })
    assert.deepEqual(observed, ['stress-restoring', 'baseline'])
    assert.equal(await readFile(file, 'utf8'), baseline)
})

test('failed runtime acknowledgement still restores source and fails publication', async (context) => {
    const root = createMemoryTestProject(context)
    const file = path.join(root, 'marker.ts')
    const failure = new Error('Runtime did not apply the restoration')
    await writeFile(file, baseline)
    await assert.rejects(
        publishHmrEdits(file, profile, async () => {
            throw failure
        }),
        failure
    )
    assert.equal(await readFile(file, 'utf8'), baseline)
})
