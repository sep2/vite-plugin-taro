import assert from 'node:assert/strict'
import { readdir, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { packageRequire } from '../utils/packages.ts'
import { createTestProject } from './create-test-project.ts'

test('isolates consumer fixtures in OS temp without losing workspace dependency resolution', async () => {
    const first = await createTestProject('project-')
    const second = await createTestProject('project-')

    assert.notEqual(first, second)
    assert.equal(path.dirname(first), path.dirname(second))
    assert.equal(path.dirname(path.dirname(first)), await realpath(tmpdir()))
    assert.deepEqual(await readdir(first), [])
    assert.deepEqual(await readdir(second), [])

    const require = createRequire(path.join(first, 'entry.js'))
    for (const dependency of ['react', 'vite', 'vite-plugin-taro-runtime/runtime/mini']) {
        assert.equal(require.resolve(dependency), packageRequire.resolve(dependency))
    }
})
