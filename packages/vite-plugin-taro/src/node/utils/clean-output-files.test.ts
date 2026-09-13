import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { cleanOutputFiles } from './clean-output-files.ts'

test('deletes every file including App styles while retaining directory identities', (context) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'vpt-clean-output-'))
    context.after(() => rmSync(root, { recursive: true, force: true }))
    const directory = path.join(root, 'dist')
    cleanOutputFiles(directory)
    assert.deepEqual(readdirSync(directory), [])
    const nested = path.join(directory, 'obsolete/nested')
    mkdirSync(nested, { recursive: true })
    const inode = statSync(nested).ino
    writeFileSync(path.join(nested, 'old.js'), 'obsolete')
    writeFileSync(path.join(directory, 'app.wxss'), 'previous marker')
    cleanOutputFiles(directory)
    assert.equal(statSync(nested).ino, inode)
    assert.deepEqual(readdirSync(nested), [])
    assert.deepEqual(readdirSync(directory), ['obsolete'])
    cleanOutputFiles(directory)
    assert.deepEqual(readdirSync(directory), ['obsolete'])
    assert.equal(statSync(nested).ino, inode)
})
