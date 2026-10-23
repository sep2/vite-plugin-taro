import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { rendererEnvironmentSource } from '../.agents/skills/test-published-packages/scripts/renderer-environment-source.ts'

test('renderer query is a single-line function', () => {
    assert.doesNotMatch(rendererEnvironmentSource, /[\r\n]/)
})

test('renderer query survives the platform command shim intact', () => {
    const command = process.platform === 'win32' ? 'cmd.exe' : process.execPath
    const args =
        process.platform === 'win32'
            ? ['/d', '/s', '/c', 'node', '-p', 'process.argv[1]', rendererEnvironmentSource]
            : ['-p', 'process.argv[1]', rendererEnvironmentSource]
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 29_000 })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), rendererEnvironmentSource)
})

test('renderer query identifies the current template page', () => {
    const result: unknown = runInNewContext(`(${rendererEnvironmentSource})()`, {
        getCurrentPages: () => [
            { __vptWxRoot: {}, renderer: 'webview', data: {} },
            { renderer: 'webview', data: { page: {}, __webviewId__: 1 } }
        ]
    })
    assert.equal(
        JSON.stringify(result),
        JSON.stringify({ nativeRoot: false, renderer: 'webview', dataKeys: ['page', '__webviewId__'] })
    )
})

test('renderer query identifies the captured DOM root', () => {
    const result: unknown = runInNewContext(`(${rendererEnvironmentSource})()`, {
        getCurrentPages: () => [
            { renderer: 'webview', data: { page: {} } },
            { __vptWxRoot: {}, renderer: 'webview', data: { __webviewId__: 1 } }
        ]
    })
    assert.equal(
        JSON.stringify(result),
        JSON.stringify({ nativeRoot: true, renderer: 'webview', dataKeys: ['__webviewId__'] })
    )
})
