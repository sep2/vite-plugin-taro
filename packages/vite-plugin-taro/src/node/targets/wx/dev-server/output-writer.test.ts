import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { syncWxPublicDirectory, syncWxPublicFile, writeWxOutputFiles } from './output-writer.ts'

test('keeps unchanged WX files when DevEngine emits a partial full output', async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-plugin-taro-output-'))
    await writeWxOutputFiles(outDir, [
        { type: 'asset', fileName: 'base.wxml', source: 'base' },
        { type: 'chunk', fileName: 'app.js', code: 'first' }
    ])
    await writeWxOutputFiles(outDir, [{ type: 'chunk', fileName: 'app.js', code: 'second' }])

    assert.equal(await fs.readFile(path.join(outDir, 'base.wxml'), 'utf8'), 'base')
    assert.equal(await fs.readFile(path.join(outDir, 'app.js'), 'utf8'), 'second')
})

test('copies and removes development public files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-plugin-taro-public-'))
    const publicDir = path.join(root, 'public')
    const outDir = path.join(root, 'dist')
    const source = path.join(publicDir, 'images', 'logo.txt')
    const output = path.join(outDir, 'images', 'logo.txt')

    await fs.mkdir(path.dirname(source), { recursive: true })
    await fs.writeFile(source, 'first')
    await syncWxPublicDirectory(publicDir, outDir)
    assert.equal(await fs.readFile(output, 'utf8'), 'first')

    await fs.rm(source)
    await syncWxPublicFile(publicDir, outDir, source)
    await assert.rejects(fs.access(output))
})
