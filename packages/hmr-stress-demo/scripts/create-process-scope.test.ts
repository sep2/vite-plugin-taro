import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { createProcessScope } from './create-process-scope.ts'

test('scope cleanup terminates children and is repeatable', async () => {
    const scope = createProcessScope()
    const child = scope.start(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {})
    await once(child, 'spawn')
    await Promise.all([scope.stop(child), scope.close()])
    assert.notEqual(child.signalCode, null)
    await scope.close()
})

test('scope cleanup handles spawn failures', async () => {
    const scope = createProcessScope()
    const child = scope.start('/nonexistent/vpt-test-executable', [], {})
    await new Promise<void>((resolve) => child.once('error', () => resolve()))
    await scope.close()
})

test('scope cleanup kills descendants after their wrapper exits', {
    skip: process.platform === 'win32'
}, async () => {
    const scope = createProcessScope()
    const child = scope.start(
        process.execPath,
        [
            '-e',
            `
        const { spawn } = require('node:child_process');
        const worker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], { stdio: 'ignore' });
        console.log(worker.pid);
        worker.unref();
    `
        ],
        {}
    )
    // Accumulate stdout until the wrapper exits to capture the descendant identity.
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString()
    })
    try {
        await once(child, 'close')
        const pid = Number(output.trim())
        assert.ok(pid > 0)
        await scope.close()
        assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    } finally {
        await scope.close()
    }
})

test('scope cleanup escalates when a child ignores SIGTERM', {
    skip: process.platform === 'win32'
}, async () => {
    const scope = createProcessScope()
    const child = scope.start(
        process.execPath,
        [
            '-e',
            `
        process.on('SIGTERM', () => {});
        setTimeout(() => {}, 10000);
        console.log('ready');
    `
        ],
        {}
    )
    try {
        await once(child.stdout, 'data')
        await scope.close()
        assert.equal(child.signalCode, 'SIGKILL')
    } finally {
        await scope.close()
    }
})
