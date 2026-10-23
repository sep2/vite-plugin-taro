import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { removeDirectory } from '../.agents/skills/test-published-packages/scripts/remove-directory.ts'

function createDirectory(): string {
    const temporaryRoot = fileURLToPath(new URL('../packages/vite-plugin-taro/tmp/', import.meta.url))
    mkdirSync(temporaryRoot, { recursive: true })
    return mkdtempSync(`${temporaryRoot}directory-removal-`)
}

test('directory removal clears nested output and accepts an absent directory', (context) => {
    const directory = createDirectory()
    context.after(() => removeDirectory(directory))
    mkdirSync(`${directory}/nested`)
    writeFileSync(`${directory}/nested/output.js`, 'output')
    removeDirectory(directory)
    assert.equal(existsSync(directory), false)
    assert.doesNotThrow(() => removeDirectory(directory))
})

test('directory removal waits for a Windows process to release its working directory', {
    skip: process.platform !== 'win32',
    timeout: 15_000
}, async (context) => {
    const directory = createDirectory()
    const child = spawn(
        process.execPath,
        [
            '-e',
            "process.stdin.once('data', () => setTimeout(() => process.exit(0), 200)); process.stdout.write('ready')"
        ],
        {
            cwd: directory,
            stdio: ['pipe', 'pipe', 'pipe']
        }
    )
    const completion = once(child, 'close')
    context.after(async () => {
        if (child.exitCode === null) {
            child.kill()
        }
        await completion
        removeDirectory(directory)
    })
    await once(child.stdout, 'data')
    assert.throws(() => rmSync(directory, { recursive: true, force: true }), /EPERM|EBUSY/)
    child.stdin.write('release')
    removeDirectory(directory)
    assert.equal(existsSync(directory), false)
    await completion
})
