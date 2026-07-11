import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeWxBundleStyles, type WxOutputFile } from './output.ts'

test('materializes embedded development styles as app.wxss', () => {
    const output: WxOutputFile[] = [
        { type: 'chunk', fileName: 'app.js', code: 'const __vite__css = "body { color: red; }";' },
        { type: 'asset', fileName: 'page.css', source: '.page { display: flex; }' }
    ]

    assert.equal(normalizeWxBundleStyles(output), '.page { display: flex; }\nbody { color: red; }')
    assert.deepEqual(output, [
        { type: 'chunk', fileName: 'app.js', code: 'const __vite__css = "body { color: red; }";' },
        { type: 'asset', fileName: 'app.wxss', source: '.page { display: flex; }\nbody { color: red; }' }
    ])
})
