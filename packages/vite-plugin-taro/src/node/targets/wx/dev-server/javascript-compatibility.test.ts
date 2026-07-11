import assert from 'node:assert/strict'
import test from 'node:test'
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

test('transforms every JavaScript chunk in bundled-development output', async () => {
    const output = [
        { type: 'chunk' as const, fileName: 'runtime.js', code: 'class Runtime { state = {} }' },
        { type: 'asset' as const, fileName: 'app.wxss', source: '' }
    ]

    await transformWxOutputChunks(output)

    assert.doesNotMatch(output[0]?.code ?? '', /^\s*state\s*=\s*\{\}/m)
    assert.equal(output[1]?.source, '')
})
