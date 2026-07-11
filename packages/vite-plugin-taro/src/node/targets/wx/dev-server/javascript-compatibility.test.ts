import assert from 'node:assert/strict'
import test from 'node:test'
import type { WxOutputFile } from './development-output.ts'
import { transformWxCompatibleJavaScript, transformWxOutputChunks } from './javascript-compatibility.ts'

test('lowers syntax rejected by the WeChat upload parser', async () => {
    const source = `
class Module {
    exportsHolder = { exports: null }
}
globalThis.bridge ??= {}
`

    const code = await transformWxCompatibleJavaScript(source, 'runtime.js')

    assert.doesNotMatch(code, /^\s*exportsHolder\s*=/m)
    assert.doesNotMatch(code, /\?\?=/)
    assert.match(code, /constructor\(\)/)
})

test('replaces getter-only DevEngine chunks with compatible JavaScript', async () => {
    const runtime = { type: 'chunk' as const, fileName: 'runtime.js' } as WxOutputFile
    Object.defineProperty(runtime, 'code', { get: () => 'class Runtime { state = {} }', enumerable: true })
    const output: WxOutputFile[] = [runtime, { type: 'asset', fileName: 'app.wxss', source: '' }]

    await transformWxOutputChunks(output)

    assert.notEqual(output[0], runtime)
    assert.doesNotMatch(output[0]?.type === 'chunk' ? output[0].code : '', /^\s*state\s*=\s*\{\}/m)
    assert.equal(output[1]?.type === 'asset' ? output[1].source : undefined, '')
})
