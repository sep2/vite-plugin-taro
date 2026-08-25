import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveConfig } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { createWxStylePlugin } from '../styles/plugins.ts'
import {
    createWxDevelopmentPlugin,
    injectPageShellHmr,
    isWxClientEnvironment,
    removeDevelopmentAppWxss
} from './plugins.ts'

const options: VptOptions = {
    target: 'wx',
    app: 'src/app.tsx',
    pages: [],
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
}

test('assigns physical WX host ownership only to the client environment', () => {
    assert.equal(isWxClientEnvironment({ name: 'client' }), true)
    assert.equal(isWxClientEnvironment({ name: 'ssr' }), false)
})

test('preserves physical outputs across development host restarts', async () => {
    const config = await resolveConfig(
        {
            configFile: false,
            plugins: createWxDevelopmentPlugin(options, createWxStylePlugin([import.meta.filename]))
        },
        'serve'
    )

    assert.equal(config.build.emptyOutDir, false)

    const pagePlugin = config.plugins.find((plugin) => plugin.name === 'vpt:wx-page-shell-hmr')
    assert.ok(pagePlugin?.transform)
    const pageTransform =
        typeof pagePlugin.transform === 'function' ? pagePlugin.transform : pagePlugin.transform.handler
    assert.equal(
        await Reflect.apply(pageTransform, {}, ['Page(pageConfig)', '/project/runtime/wx/native/page.js?other']),
        undefined
    )
})

test('transfers the App style entry from complete output to the development host', () => {
    const appStyle = { type: 'asset', source: '@import "./assets/global.wxss";\n' }
    const globalStyle = { type: 'asset', source: '.app {}' }
    const bundle = {
        'app.wxss': appStyle,
        'assets/global.wxss': globalStyle
    }

    removeDevelopmentAppWxss(bundle)

    assert.deepEqual(bundle, { 'assets/global.wxss': globalStyle })
})

test('injects Page HMR immediately before native registration', () => {
    const result = injectPageShellHmr("import pageConfig from 'capsule'\nPage(pageConfig)")

    assert.match(result.code, /Page\(__rolldown_runtime__\.injectPageHmr\(pageConfig\)\)$/)
    assert.equal(result.map, null)
})

test('rejects a native Page shell without the stable registration contract', () => {
    assert.throws(() => injectPageShellHmr('Page(config)'), /must register pageConfig/)
})
