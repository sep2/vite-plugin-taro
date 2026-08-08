import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { type PatchUpdate, renderHmrPatches, renderInitialHmrPatches, writeHmrFile } from './hmr-files.ts'

const patch: PatchUpdate = {
    type: 'Patch',
    code: 'registerLatestFactory()',
    filename: 'pages/index.js',
    changedIds: ['src/page.tsx'],
    seq: 1
}

test('renders initial and cumulative patches as inert CommonJS data', () => {
    assert.equal(renderInitialHmrPatches(), 'module.exports = undefined;\n')

    const source = renderHmrPatches('build', [patch])
    assert.match(source, /^module\.exports = \{buildId: "build", patches:/)
    assert.match(source, /registerLatestFactory\(\)/)
    assert.doesNotMatch(source, /^__rolldown_runtime__/)
})

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
