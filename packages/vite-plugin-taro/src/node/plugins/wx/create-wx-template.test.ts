import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
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

for (const useXS of [true, false]) {
    test(`forwards optional ScrollView padding with WXS ${useXS ? 'enabled' : 'disabled'}`, () => {
        const template = createWxTemplate()
        template.isUseXS = useXS
        const source = template.buildTemplate({
            includes: new Set(['view', 'scroll-view']),
            exclude: new Set(),
            thirdPartyComponents: new Map(),
            includeAll: false
        })
        const scrollViews = Array.from(source.matchAll(/<scroll-view\b([^>]+)>/g), (match) => match[1])
        assert.ok(scrollViews.length > 0)

        for (const attributes of scrollViews) {
            const binding = attributes.match(/\bpadding="{{(i\.([\w$]+))}}"/)
            assert.ok(binding, 'padding binds directly to the component data')
            assert.equal(runInNewContext(binding[1], { i: {} }), undefined)
            for (const padding of [
                [0, 0, 0, 0],
                [12, 24, 36, 48]
            ]) {
                assert.equal(runInNewContext(binding[1], { i: { [binding[2]]: padding } }), padding)
            }
        }
    })
}
