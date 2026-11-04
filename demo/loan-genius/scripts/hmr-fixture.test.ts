import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { createMemoryTestProject } from '../../../packages/vite-plugin-taro/src/node/tests/create-memory-test-project.ts'
import { stopLoanHmrServer, withLoanHmrFixture } from './hmr-fixture.ts'

test('state-retention probe reads the opt-in URL from the host global', async () => {
    await withLoanHmrFixture('state-retention', async (fixture) => {
        assert.equal(path.dirname(fixture.root), path.resolve(import.meta.dirname, '../tmp'))
        assert.equal(
            await realpath(path.join(fixture.root, 'node_modules')),
            await realpath(path.resolve(import.meta.dirname, '../node_modules'))
        )
        const source = await fixture.read('src/pages/calculator/index.tsx')
        assert.match(source, /id="loan-polyfill-probe">URL:\{new globalThis\.URL\('child'/)
        assert.doesNotMatch(source, /id="loan-polyfill-probe">URL:\{new URL\(/)
        const config = await fixture.read('vite.config.ts')
        assert.doesNotMatch(config, /renderer: 'skyline'|rendererOptions|disableABTest/)
    })
})

test('server cleanup awaits exit and closes the log handle', async (context) => {
    const root = createMemoryTestProject(context)
    const logFile = await open(path.join(root, 'vite.log'), 'w')
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { stdio: 'ignore' })
    try {
        await once(child, 'spawn')
        await stopLoanHmrServer({ process: child, logFile: logFile })
        assert.notEqual(child.signalCode, null)
        assert.equal(logFile.fd, -1)
    } finally {
        child.kill('SIGKILL')
        await logFile.close()
    }
})

test('forced shutdown reports failure but still closes the log handle', {
    skip: process.platform === 'win32'
}, async (context) => {
    const root = createMemoryTestProject(context)
    const logFile = await open(path.join(root, 'vite.log'), 'w')
    const child = spawn(
        process.execPath,
        [
            '-e',
            `
        process.on('SIGTERM', () => {});
        setTimeout(() => {}, 10000);
        console.log('ready');
    `
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] }
    )
    try {
        await once(child.stdout, 'data')
        await assert.rejects(stopLoanHmrServer({ process: child, logFile: logFile }), /did not drain/)
        assert.equal(child.signalCode, 'SIGKILL')
        assert.equal(logFile.fd, -1)
    } finally {
        child.kill('SIGKILL')
        await logFile.close()
    }
})
