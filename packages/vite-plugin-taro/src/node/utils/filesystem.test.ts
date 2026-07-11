import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { copyDirectoryIfExists, copyFileOrRemove, writeFilesAtomically } from './filesystem.ts'

test('atomic batches leave files omitted by a later partial batch unchanged', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-plugin-taro-files-'))
    const stableFile = path.join(directory, 'stable.txt')
    const changedFile = path.join(directory, 'changed.txt')

    await writeFilesAtomically([
        { file: stableFile, source: 'stable' },
        { file: changedFile, source: 'first' }
    ])
    await writeFilesAtomically([{ file: changedFile, source: 'second' }])

    assert.equal(await fs.readFile(stableFile, 'utf8'), 'stable')
    assert.equal(await fs.readFile(changedFile, 'utf8'), 'second')
})

test('copies optional directories and removes destinations for missing files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-plugin-taro-copy-'))
    const sourceDirectory = path.join(root, 'source')
    const destinationDirectory = path.join(root, 'destination')
    const sourceFile = path.join(sourceDirectory, 'images', 'logo.txt')
    const destinationFile = path.join(destinationDirectory, 'images', 'logo.txt')

    await fs.mkdir(path.dirname(sourceFile), { recursive: true })
    await fs.writeFile(sourceFile, 'first')
    await copyDirectoryIfExists(sourceDirectory, destinationDirectory)
    assert.equal(await fs.readFile(destinationFile, 'utf8'), 'first')

    await fs.rm(sourceFile)
    await copyFileOrRemove(sourceFile, destinationFile)
    await assert.rejects(fs.access(destinationFile))
})
