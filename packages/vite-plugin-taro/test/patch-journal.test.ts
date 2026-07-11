import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { syncWxPublicDirectory, syncWxPublicFile, writeWxOutput } from '../src/wx-dev/output-writer.ts'
import { WxPatchJournal } from '../src/wx-dev/patch-journal.ts'

test('writes a literal, cumulative, versioned patch journal', async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-plugin-taro-journal-'))
    const journal = new WxPatchJournal(outDir)

    await journal.reset()
    await journal.append('globalThis.firstPatch = true;')
    await journal.append('globalThis.secondPatch = true;')

    const source = await fs.readFile(path.join(outDir, journal.fileName), 'utf8')
    assert.match(source, /bridge\.version < 1/)
    assert.match(source, /bridge\.version < 2/)
    assert.match(source, /globalThis\.firstPatch = true/)
    assert.match(source, /globalThis\.secondPatch = true/)
    assert.match(source, /bridge\.pendingUpdate = applyUpdates/)
    assert.doesNotMatch(source, /\beval\b|new Function/)
    assert.equal(journal.length, 2)
    assert.ok(journal.size > 0)
})

test('keeps unchanged WX files when DevEngine emits a partial full output', async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-plugin-taro-output-'))
    await writeWxOutput(outDir, [
        { type: 'asset', fileName: 'base.wxml', source: 'base' },
        { type: 'chunk', fileName: 'app.js', code: 'first' }
    ])
    await writeWxOutput(outDir, [{ type: 'chunk', fileName: 'app.js', code: 'second' }])

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
