import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { writeHmrFile } from './hmr-files.ts'

test('atomically replaces a complete HMR module without leaving temporary files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-hmr-file-'))
    const fileName = 'hmr/patches.js'
    const filePath = path.join(root, fileName)

    try {
        await writeHmrFile(root, fileName, 'old generation')
        const previousInode = (await fs.stat(filePath)).ino

        await writeHmrFile(root, fileName, 'new generation')

        assert.equal(await fs.readFile(filePath, 'utf8'), 'new generation')
        assert.notEqual((await fs.stat(filePath)).ino, previousInode)
        assert.deepEqual(await fs.readdir(path.dirname(filePath)), ['patches.js'])
    } finally {
        await fs.rm(root, { force: true, recursive: true })
    }
})
