import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { pageInitializationSource } from './page-initialization-source.ts'

test('native Page initialization query is a complete single-line function', () => {
    assert.doesNotMatch(pageInitializationSource, /[\r\n]/)
    const result: unknown = runInNewContext(`(${pageInitializationSource})()`, {
        getCurrentPages: () => [{ renderer: 'webview', data: { app: { nn: 'vpt_fragment' } } }]
    })
    assert.equal(
        JSON.stringify(result),
        JSON.stringify({
            renderer: 'webview',
            glassEasel: false,
            dataFactoryRan: false,
            appNodeName: 'vpt_fragment'
        })
    )
})

test('native Page initialization query survives the platform command shim intact', () => {
    const command = process.platform === 'win32' ? 'cmd.exe' : process.execPath
    const args =
        process.platform === 'win32'
            ? ['/d', '/s', '/c', 'node', '-p', 'process.argv[1]', pageInitializationSource]
            : ['-p', 'process.argv[1]', pageInitializationSource]
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 29_000 })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), pageInitializationSource)
})

test('native Page initialization query observes the current glass-easel data-factory result', () => {
    const result: unknown = runInNewContext(`(${pageInitializationSource})()`, {
        getCurrentPages: () => [
            { renderer: 'skyline', data: { app: { nn: 'hidden' } } },
            {
                renderer: 'webview',
                groupUpdates: () => {},
                $taroPath: '/pages/mirror/index?$vptPage=2',
                data: { app: { nn: 'vpt_fragment' }, __hmrDataFactoryRan: true }
            }
        ]
    })
    assert.equal(
        JSON.stringify(result),
        JSON.stringify({
            renderer: 'webview',
            glassEasel: true,
            dataFactoryRan: true,
            appNodeName: 'vpt_fragment'
        })
    )
})

test('a normal glass-easel Page identity is independent of data-factory execution', () => {
    const result: unknown = runInNewContext(`(${pageInitializationSource})()`, {
        getCurrentPages: () => [
            {
                renderer: 'webview',
                groupUpdates: () => {},
                $taroPath: '/pages/index/index?$vptPage=1',
                data: {}
            }
        ]
    })
    assert.equal(
        JSON.stringify(result),
        JSON.stringify({
            renderer: 'webview',
            glassEasel: true,
            dataFactoryRan: false
        })
    )
})
