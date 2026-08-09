import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveConfig } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import {
    createWxDevelopmentPlugin,
    injectPageHmr,
    injectReactRefreshBootstrap,
    injectTaroConnection
} from './plugins.ts'

const options: VitePluginTaroOptions = {
    target: 'wx',
    app: 'src/app.tsx',
    pages: [],
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
}

test('preserves physical outputs across development host restarts', async () => {
    const config = await resolveConfig(
        {
            configFile: false,
            plugins: createWxDevelopmentPlugin(options)
        },
        'serve'
    )

    assert.equal(config.build.emptyOutDir, false)
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
