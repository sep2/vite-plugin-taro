import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { WxPatchJournal } from './patch-journal.ts'

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
