import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { WxOutputWriter } from '../src/wx-dev/output-writer.ts'
import { WxPatchJournal } from '../src/wx-dev/patch-journal.ts'

test('writes a literal, cumulative, versioned patch journal', async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-plugin-taro-journal-'))
    const journal = new WxPatchJournal(outDir)

    await journal.reset()
    await journal.append('globalThis.firstPatch = true;')
    await journal.append('globalThis.secondPatch = true;')

    const source = await fs.readFile(path.join(outDir, journal.fileName), 'utf8')
    assert.match(source, /__WX_HMR_VERSION__ < 1/)
    assert.match(source, /__WX_HMR_VERSION__ < 2/)
    assert.match(source, /globalThis\.firstPatch = true/)
    assert.match(source, /globalThis\.secondPatch = true/)
    assert.match(source, /__WX_PENDING_BUNDLED_HMR__ = applyUpdates/)
    assert.doesNotMatch(source, /\beval\b|new Function/)
    assert.equal(journal.length, 2)
    assert.ok(journal.size > 0)
})

test('keeps unchanged WX files when DevEngine emits a partial full output', async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-plugin-taro-output-'))
    const writer = new WxOutputWriter(outDir)

    await writer.writeFullOutput([
        { type: 'asset', fileName: 'base.wxml', source: 'base' },
        { type: 'chunk', fileName: 'app.js', code: 'first' }
    ])
    await writer.writeFullOutput([{ type: 'chunk', fileName: 'app.js', code: 'second' }])

    assert.equal(await fs.readFile(path.join(outDir, 'base.wxml'), 'utf8'), 'base')
    assert.equal(await fs.readFile(path.join(outDir, 'app.js'), 'utf8'), 'second')
})
