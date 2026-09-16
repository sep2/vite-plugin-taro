import assert from 'node:assert/strict'
import test from 'node:test'
import { createZfbTemplate } from './create-zfb-template.ts'

test('renders Alipay-specific component, third-party, and PageMeta branches', () => {
    const template = createZfbTemplate()
    const source = template.buildTemplate({
        includes: new Set(['view', 'map', 'picker', 'swiper', 'swiper-item']),
        exclude: new Set(),
        thirdPartyComponents: new Map([['native-card', new Set(['@select', 'bindchange', 'onReady', 'title'])]]),
        includeAll: false
    })

    assert.match(source, /<map[\s\S]*polygon="/)
    assert.match(source, /<picker[\s\S]*<view>/)
    assert.match(source, /<swiper[\s\S]*<swiper-item/)
    assert.doesNotMatch(source, /<template name="tmpl_0_[^"]+">\s*<swiper-item/)
    assert.match(source, /<native-card onSelect="eh" bindchange="eh" onReady="eh" {2}title="{{ i\.title }}"/)
    assert.match(source, /<native-card[\s\S]*<template a:else/)

    const pageMeta = template.buildPageTemplate('../../base.axml', {
        content: { enablePageMeta: true },
        path: 'pages/home/index'
    })
    assert.match(pageMeta, /<import-sjs name="xs" from="\.\.\/\.\.\/utils\.sjs" \/>/)
    assert.match(pageMeta, /<page-meta[\s\S]*onScroll="eh"/)
    assert.doesNotMatch(template.buildPageTemplate('../../base.axml', undefined), /<page-meta/)
    assert.equal(template.buildXsTemplate('../shared/utils'), '<import-sjs name="xs" from="../shared/utils.sjs" />')
})
