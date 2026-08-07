import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { emptyOutputDirectory } from './empty-output-directory.ts'

test('empties an existing output directory without replacing it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-empty-output-'))
    const outputDirectory = path.join(root, 'dist')

    try {
        await fs.mkdir(path.join(outputDirectory, 'assets'), { recursive: true })
        await fs.mkdir(path.join(outputDirectory, '.git'), { recursive: true })
        await fs.writeFile(path.join(outputDirectory, 'app.js'), 'stale')
        await fs.writeFile(path.join(outputDirectory, 'assets', 'stale.js'), 'stale')
        await fs.writeFile(path.join(outputDirectory, '.git', 'HEAD'), 'ref: refs/heads/main')

        const originalStats = await fs.stat(outputDirectory)
        await emptyOutputDirectory(outputDirectory)

        assert.deepEqual(await fs.readdir(outputDirectory), ['.git'])
        assert.equal(await fs.readFile(path.join(outputDirectory, '.git', 'HEAD'), 'utf8'), 'ref: refs/heads/main')
        assert.equal((await fs.stat(outputDirectory)).ino, originalStats.ino)
    } finally {
        await fs.rm(root, { force: true, recursive: true })
    }
})

test('creates a missing output directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-empty-output-'))
    const outputDirectory = path.join(root, 'dist')

    try {
        await emptyOutputDirectory(outputDirectory)
        assert.deepEqual(await fs.readdir(outputDirectory), [])
    } finally {
        await fs.rm(root, { force: true, recursive: true })
    }
})
