import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { CssPipeline } from './css-pipeline.ts'

test('uses upstream transformed app.wxss and removes duplicate browser styles', async () => {
    const bundle = {
        'app.wxss': {
            type: 'asset',
            fileName: 'app.wxss',
            source: '@import "./app-origin.wxss";\n'
        },
        'app-origin.wxss': {
            type: 'asset',
            fileName: 'app-origin.wxss',
            source: '.flex{display:flex}'
        },
        'assets/app.css': {
            type: 'asset',
            fileName: 'assets/app.css',
            source: '.browser{display:block}'
        }
    } as unknown as Rolldown.OutputBundle

    const appWxss = await new CssPipeline('wx').createAppWxss(bundle)

    assert.equal(appWxss, '@import "./app-origin.wxss";\n')
    assert.equal(bundle['app.wxss'], undefined)
    assert.equal(bundle['assets/app.css'], undefined)
    assert.ok(bundle['app-origin.wxss'])
})
