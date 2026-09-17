import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { cleanOutputFiles } from './clean-output-files.ts'

function createEntry(parentPath: string, name: string, directory: boolean): fs.Dirent {
    return Object.assign(new fs.Dirent(), { parentPath, name, isDirectory: () => directory })
}

test('creates the output directory and unlinks only files while retaining directory entries', (context) => {
    const directory = path.resolve('/fixture/dist')
    const obsolete = createEntry(directory, 'obsolete', true)
    const nested = createEntry(path.join(directory, 'obsolete'), 'nested', true)
    const oldFile = createEntry(path.join(directory, 'obsolete/nested'), 'old.js', false)
    const appStyle = createEntry(directory, 'app.wxss', false)
    const link = createEntry(directory, 'linked-component', false)
    const generations = [[], [obsolete, nested, oldFile, appStyle, link], [obsolete, nested]]
    // This cursor supplies the empty, populated and already-clean directory snapshots to three synchronous calls.
    let generation = 0
    const mkdir = context.mock.method(fs, 'mkdirSync', () => undefined)
    const readdir = context.mock.method(fs, 'readdirSync', () => generations[generation++]!)
    const unlink = context.mock.method(fs, 'unlinkSync', () => {})
    // Refresh the utility's named builtin imports, then restore them before returning control to the test runner.
    syncBuiltinESMExports()
    try {
        cleanOutputFiles(directory)
        assert.equal(unlink.mock.callCount(), 0)
        cleanOutputFiles(directory)
        cleanOutputFiles(directory)
    } finally {
        context.mock.restoreAll()
        syncBuiltinESMExports()
    }
    assert.deepEqual(
        mkdir.mock.calls.map((call) => call.arguments),
        [
            [directory, { recursive: true }],
            [directory, { recursive: true }],
            [directory, { recursive: true }]
        ]
    )
    assert.deepEqual(
        readdir.mock.calls.map((call) => call.arguments),
        [
            [directory, { recursive: true, withFileTypes: true }],
            [directory, { recursive: true, withFileTypes: true }],
            [directory, { recursive: true, withFileTypes: true }]
        ]
    )
    assert.deepEqual(
        unlink.mock.calls.map((call) => call.arguments),
        [
            [path.join(oldFile.parentPath, oldFile.name)],
            [path.join(appStyle.parentPath, appStyle.name)],
            [path.join(link.parentPath, link.name)]
        ]
    )
})
