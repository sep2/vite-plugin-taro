import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveConfig } from 'vite'
import { createMiniContract } from '../../wx/plugins.ts'
import { createMiniStylePlugin } from '../styles/plugins.ts'
import { createMiniDevelopmentPlugin, isMiniClientEnvironment, removeDevelopmentAppStyle } from './plugins.ts'

const contract = createMiniContract({
    target: 'wx',
    app: 'src/app.tsx',
    pages: [],
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
})

test('assigns physical Mini Program host ownership only to the client environment', () => {
    assert.equal(isMiniClientEnvironment({ name: 'client' }), true)
    assert.equal(isMiniClientEnvironment({ name: 'ssr' }), false)
})

test('preserves physical outputs and composes the selected mode across development restarts', async () => {
    const config = await resolveConfig(
        {
            configFile: false,
            plugins: createMiniDevelopmentPlugin(contract, createMiniStylePlugin(contract, [import.meta.filename]))
        },
        'serve'
    )

    assert.equal(config.build.emptyOutDir, false)
    assert.ok(config.plugins.some((plugin) => plugin.name === 'vpt:mini-page-shell-hmr'))
})

test('transfers the App style entry from complete output to the development host', () => {
    const appStyle = { type: 'asset', source: '@import "./assets/global.wxss";\n' }
    const globalStyle = { type: 'asset', source: '.app {}' }
    const bundle = {
        'app.wxss': appStyle,
        'assets/global.wxss': globalStyle
    }

    removeDevelopmentAppStyle(bundle, contract.styles.appFileName)

    assert.deepEqual(bundle, { 'assets/global.wxss': globalStyle })
})
