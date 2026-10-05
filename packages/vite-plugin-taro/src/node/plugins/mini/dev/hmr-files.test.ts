import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { projectTempDir } from '../../../tests/project-temp-dir.ts'
import { renderDevelopmentAppStyle, renderHmrInfo, writeDevelopmentFile } from './hmr-files.ts'

test('renders frozen CommonJS build metadata', () => {
    assert.equal(
        renderHmrInfo({ buildId: 'build', endpoint: 'ws://localhost/hmr?token=test' }),
        'module.exports = Object.freeze({"buildId":"build","endpoint":"ws://localhost/hmr?token=test"});\n'
    )
})

test('revises the development App style entry for each complete build', () => {
    assert.equal(
        renderDevelopmentAppStyle('assets/global.wxss', 'build-one'),
        '@import "./assets/global.wxss";\n/* vpt-build:build-one */\n'
    )
    assert.notEqual(
        renderDevelopmentAppStyle('assets/global.wxss', 'build-one'),
        renderDevelopmentAppStyle('assets/global.wxss', 'build-two')
    )
})

test('atomically replaces a complete development file without leaving temporary files', async () => {
    const root = await fs.mkdtemp(path.join(projectTempDir, 'vpt-hmr-file-'))
    const fileName = 'hmr/info.js'
    const filePath = path.join(root, fileName)

    try {
        await writeDevelopmentFile(root, fileName, 'old generation')
        const previousInode = (await fs.stat(filePath)).ino

        await writeDevelopmentFile(root, fileName, 'new generation')

        assert.equal(await fs.readFile(filePath, 'utf8'), 'new generation')
        assert.notEqual((await fs.stat(filePath)).ino, previousInode)
        assert.deepEqual(await fs.readdir(path.dirname(filePath)), ['info.js'])
    } finally {
        await fs.rm(root, { force: true, recursive: true })
    }
})
