import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveConfig } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import {
    createWxDevelopmentPlugin,
    injectPageHmr,
    injectReactRefreshBootstrap,
    injectTaroConnection,
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
            plugins: createWxDevelopmentPlugin(options, ['/app-capsule'])
        },
        'serve'
    )

    assert.equal(config.build.emptyOutDir, false)
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

test('evaluates React Refresh before the App dependency graph', () => {
    const result = injectReactRefreshBootstrap("import App from './app.tsx'")

    assert.match(result.code, /^import "\/@react-refresh";/)
    assert.equal(result.map, null)
})

test('activates the shared HMR runtime in a development Page capsule', () => {
    const source = 'const config = createPageConfig()\nexport default config'
    const result = injectPageHmr(source, 'pages/home/index')

    assert.match(
        result.code,
        /export default config\n__rolldown_runtime__\.injectPageHmr\(config, "pages\/home\/index"\);$/
    )
    assert.equal(result.map, null)
})

test('rejects a Page capsule without the stable config contract', () => {
    assert.throws(
        () => injectPageHmr('export default createPageConfig()', 'pages/home/index'),
        /must declare and default-export config/
    )
})

test('connects the application graph Taro runtime to the WX dev runtime', () => {
    const source = "export { Current, document, injectPageInstance } from '@tarojs/runtime'"
    const result = injectTaroConnection(source)

    assert.match(result.code, /import \{ Current as __vptCurrent, document as __vptDocument/)
    assert.match(
        result.code,
        /__rolldown_runtime__\.connectTaro\(__vptCurrent, __vptDocument, __vptInjectPageInstance\);$/
    )
    assert.equal(result.map, null)
})

test('rejects a Taro facade without the connection contract', () => {
    assert.throws(() => injectTaroConnection("export { Current } from '@tarojs/runtime'"), /must expose/)
})
