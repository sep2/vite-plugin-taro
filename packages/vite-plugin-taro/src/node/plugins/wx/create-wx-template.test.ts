import assert from 'node:assert/strict'
import test from 'node:test'
import { createWxTemplate } from './create-wx-template.ts'

test('renders WX-specific component and PageMeta branches', () => {
    const template = createWxTemplate()
    const source = template.buildTemplate({
        includes: new Set(['view', 'canvas', 'share-element', 'keyboard-accessory']),
        exclude: new Set(),
        thirdPartyComponents: new Map(),
        includeAll: false
    })

    assert.match(source, /<view[\s\S]*bindlongpress="eh"/)
    assert.match(source, /<canvas[\s\S]*bindlongtap="eh"/)
    assert.match(source, /<share-element key="{{i\.[^}]+}}"/)
    assert.doesNotMatch(source, /<keyboard-accessory/)

    const pageMeta = template.buildPageTemplate('../../base.wxml', {
        content: { enablePageMeta: true },
        path: 'pages/home/index'
    })
    assert.match(pageMeta, /<wxs module="xs" src="\.\.\/\.\.\/utils\.wxs" \/>/)
    assert.match(pageMeta, /<page-meta[\s\S]*bindresize="eh"/)
    assert.match(pageMeta, /<navigation-bar/)
    assert.doesNotMatch(template.buildPageTemplate('../../base.wxml', undefined), /<page-meta/)
    assert.equal(template.buildXsTemplate('../shared/utils'), '<wxs module="xs" src="../shared/utils.wxs" />')
})
