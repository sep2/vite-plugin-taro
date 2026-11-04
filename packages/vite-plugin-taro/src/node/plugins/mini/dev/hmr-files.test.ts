import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { createMemoryTestProject } from '../../../tests/create-memory-test-project.ts'
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

test('atomically replaces a complete development file without leaving temporary files', async (context) => {
    const root = createMemoryTestProject(context)
    const fileName = 'hmr/info.js'
    const filePath = path.join(root, fileName)

    await writeDevelopmentFile(root, fileName, 'old generation')
    await using previousFile = await fs.open(filePath, 'r')

    await writeDevelopmentFile(root, fileName, 'new generation')

    assert.equal(await fs.readFile(filePath, 'utf8'), 'new generation')
    assert.equal(await previousFile.readFile('utf8'), 'old generation')
    assert.deepEqual(await fs.readdir(path.dirname(filePath)), ['info.js'])
})
