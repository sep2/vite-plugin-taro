import assert from 'node:assert/strict'
import test from 'node:test'
import { stampWxFullBuild, type WxOutputFile } from './bundle-output.ts'

test('stamps app.js without unsupported nullish assignment syntax', () => {
    const output: WxOutputFile[] = [{ type: 'chunk', fileName: 'app.js', code: 'App({});' }]

    stampWxFullBuild(output)

    const app = output[0]
    assert.equal(app?.type, 'chunk')
    if (app?.type !== 'chunk') return
    assert.doesNotMatch(app.code, /\?\?=/)
    assert.match(app.code, /globalThis\.__VITE_PLUGIN_TARO_WX__\.fullBuild = \d+/)
})
