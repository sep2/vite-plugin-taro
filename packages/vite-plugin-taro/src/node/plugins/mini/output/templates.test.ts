import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { createMiniContract } from '../../wx/plugins.ts'
import { createTemplateAssets, replaceExactlyOnce } from './templates.ts'

const contract = createMiniContract({
    target: 'wx',
    app: 'src/app.tsx',
    pages: [
        {
            path: 'pages/home/index',
            config: {
                navigationBarTitleText: 'Home',
                usingComponents: {
                    custom: '../../custom'
                },
                componentPlaceholder: {
                    custom: 'text'
                }
            }
        },
        {
            path: 'pages/account/index',
            config: {
                navigationBarTitleText: 'Account'
            }
        }
    ],
    appJson: {
        pages: ['stale/index'],
        window: {
            navigationBarTitleText: 'Example'
        }
    },
    projectConfigJson: {
        appid: 'wx-example'
    },
    projectPrivateConfigJson: {
        setting: {
            compileHotReLoad: true
        }
    },
    sitemapJson: {
        rules: []
    }
})

test('enforces exact pinned Taro template fragments', () => {
    assert.equal(
        replaceExactlyOnce('before TOKEN after', 'TOKEN', 'replacement', 'fixture'),
        'before replacement after'
    )
    assert.throws(() => replaceExactlyOnce('before after', 'TOKEN', 'replacement', 'fixture'), /found 0/)
    assert.throws(
        () => replaceExactlyOnce('TOKEN before TOKEN after', 'TOKEN', 'replacement', 'fixture'),
        /found multiple/
    )
})

test('creates native rendering and configuration assets', () => {
    const output = createTemplateAssets({
        bundle: {} as Rolldown.OutputBundle,
        contract: contract,
        subpackages: [{ name: 'p_example', root: 'sub/p_example', pages: [] }],
        isProduction: false,
        nativeComponents: [
            {
                name: 'native-counter',
                componentPath: '/components/native-counter/index',
                fields: ['count', 'extraData', 'label', 'onIncrement']
            },
            {
                name: 'native-card',
                componentPath: '/sub/p_card/components/native-card/index',
                fields: []
            }
        ]
    })
    const assets = new Map(output.map((asset) => [asset.fileName, String(asset.source)]))
    const nativeUsingComponents = {
        'native-counter': '/components/native-counter/index',
        'native-card': '/sub/p_card/components/native-card/index'
    }
    const nativeComponentPlaceholder = {
        'native-card': 'view'
    }

    assert.deepEqual(
        [...assets.keys()],
        [
            'app.json',
            'base.wxml',
            'utils.wxs',
            'comp.wxml',
            'comp.json',
            'custom-wrapper.wxml',
            'custom-wrapper.json',
            'pages/home/index.json',
            'pages/home/index.wxml',
            'pages/home/index.wxss',
            'pages/account/index.json',
            'pages/account/index.wxml',
            'pages/account/index.wxss',
            'project.config.json',
            'project.private.config.json',
            'sitemap.json'
        ]
    )
    assert.match(assets.get('app.json') ?? '', /^\{\n {4}"/)
    assert.match(assets.get('app.json') ?? '', /\n$/)
    assert.deepEqual(JSON.parse(assets.get('app.json') ?? ''), {
        pages: ['pages/home/index', 'pages/account/index'],
        window: {
            navigationBarTitleText: 'Example'
        },
        subPackages: [{ name: 'p_example', root: 'sub/p_example', pages: [] }]
    })
    assert.deepEqual(JSON.parse(assets.get('pages/home/index.json') ?? ''), {
        navigationBarTitleText: 'Home',
        usingComponents: {
            custom: '../../custom',
            ...nativeUsingComponents,
            comp: '../../comp',
            'custom-wrapper': '../../custom-wrapper'
        },
        componentPlaceholder: {
            custom: 'text',
            ...nativeComponentPlaceholder
        }
    })
    assert.deepEqual(JSON.parse(assets.get('pages/account/index.json') ?? ''), {
        navigationBarTitleText: 'Account',
        usingComponents: {
            ...nativeUsingComponents,
            comp: '../../comp',
            'custom-wrapper': '../../custom-wrapper'
        },
        componentPlaceholder: nativeComponentPlaceholder
    })
    assert.deepEqual(JSON.parse(assets.get('project.config.json') ?? ''), contract.options.projectConfigJson)
    assert.deepEqual(
        JSON.parse(assets.get('project.private.config.json') ?? ''),
        contract.options.projectPrivateConfigJson
    )
    assert.deepEqual(JSON.parse(assets.get('sitemap.json') ?? ''), contract.options.sitemapJson)

    const baseTemplate = assets.get('base.wxml') ?? ''
    const componentTemplate = assets.get('comp.wxml') ?? ''
    const homeTemplate = assets.get('pages/home/index.wxml') ?? ''

    assert.match(baseTemplate, /<template name="tmpl_0_native-counter">/)
    assert.equal((baseTemplate.match(/<template name="tmpl_\d+_custom-wrapper">/g) ?? []).length, 15)
    assert.match(
        baseTemplate,
        /<native-counter\s+count="{{i\.count}}" extraData="{{i\.extraData}}" label="{{i\.label}}" bindincrement="eh"/
    )
    assert.match(
        baseTemplate,
        /<template name="tmpl_0_vpt_fragment">\s*<template\s+is="{{xs\.a\(0, item\.nn, ''\)}}"\s+data="{{i:item,c:1,l:xs\.f\('',item\.nn\)}}"[\s\S]*wx:for="{{i\.cn}}"[\s\S]*wx:key="sid"/
    )
    assert.match(baseTemplate, /<template name="tmpl_0_vpt_page_outlet">\s*<slot \/>\s*<\/template>/)
    assert.match(baseTemplate, /<comp i="{{i}}" l="{{l}}">\s*<slot wx:if="{{i\.vo}}" \/>\s*<\/comp>/)
    assert.doesNotMatch(baseTemplate, /p:p|xs\.g\(|p="{{p}}"/)

    const xScript = assets.get('utils.wxs') ?? ''
    assert.doesNotMatch(xScript, /vpt_page_outlet|module\.exports\.g/)
    assert.match(componentTemplate, /<template is="{{'tmpl_0_' \+ i\.nn}}" data="{{i:i,c:1,l:xs\.f\('',i\.nn\)}}" \/>/)
    assert.doesNotMatch(componentTemplate, /appData|appRoot|slotMode|p="/)
    const recursiveComponentJson = {
        component: true,
        styleIsolation: 'apply-shared',
        usingComponents: {
            ...nativeUsingComponents,
            comp: './comp',
            'custom-wrapper': './custom-wrapper'
        },
        componentPlaceholder: nativeComponentPlaceholder
    }
    assert.deepEqual(JSON.parse(assets.get('comp.json') ?? ''), recursiveComponentJson)
    assert.match(assets.get('custom-wrapper.wxml') ?? '', /<import src="\.\/base\.wxml" \/>/)
    assert.deepEqual(JSON.parse(assets.get('custom-wrapper.json') ?? ''), recursiveComponentJson)
    assert.match(homeTemplate, /\.\.\/\.\.\/base\.wxml/)
    assert.match(homeTemplate, /<comp i="{{app}}">\s*<template is="taro_tmpl" data="{{root:page}}" \/>\s*<\/comp>/)
    assert.doesNotMatch(homeTemplate, /root:root/)
    assert.equal(assets.get('pages/home/index.wxss'), '')
    assert.match(assets.get('pages/account/index.wxml') ?? '', /\.\.\/\.\.\/base\.wxml/)
    assert.equal(assets.get('pages/account/index.wxss'), '')
})
