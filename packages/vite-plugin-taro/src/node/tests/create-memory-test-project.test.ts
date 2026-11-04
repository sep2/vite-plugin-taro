import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { createMemoryTestProject } from './create-memory-test-project.ts'

test('isolates fixture trees while supporting synchronous and asynchronous node:fs calls', async (context) => {
    const first = createMemoryTestProject(context)
    const second = createMemoryTestProject(context)
    assert.notEqual(first, second)
    writeFileSync(path.join(first, 'fixture.txt'), 'first')
    await writeFile(path.join(second, 'fixture.txt'), 'second')
    assert.equal(await readFile(path.join(first, 'fixture.txt'), 'utf8'), 'first')
    assert.equal(readFileSync(path.join(second, 'fixture.txt'), 'utf8'), 'second')
})

test('unmounts fixtures when their owning test completes', async (context) => {
    // Retain the mounted path only to verify that child-test teardown releases it.
    let root = ''
    await context.test('owns a mounted tree', (child) => {
        root = createMemoryTestProject(child)
        writeFileSync(path.join(root, 'fixture.txt'), 'fixture')
        assert.ok(existsSync(root))
    })
    assert.equal(existsSync(root), false)
})
