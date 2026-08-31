import assert from 'node:assert/strict'
import { test } from 'node:test'
import { transformSync } from '@babel/core'
import { resolveConfig } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { packageRequire } from '../../utils/packages.ts'
import { createH5TargetPlugins, h5TaroApiPreset, h5TaroApiTransformCodeFilter } from './plugins.ts'

const options: VptOptions = {
    target: 'h5',
    app: 'src/app.tsx',
    pages: [],
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
}

test('promotes compiler-owned H5 dependencies to optimizer entries', async () => {
    const config = await resolveConfig(
        {
            configFile: false,
            plugins: createH5TargetPlugins(options)
        },
        'serve'
    )

    assert.deepEqual(config.optimizeDeps.include, [
        '@tarojs/plugin-platform-h5/dist/runtime/apis',
        '@tarojs/router',
        '@tarojs/runtime',
        'react-dom/client'
    ])
    assert.deepEqual(config.optimizeDeps.exclude, [])

    const platformApiAlias = config.resolve.alias.find((alias) => {
        return alias.find instanceof RegExp && alias.find.test('@tarojs/plugin-platform-h5/dist/runtime/apis')
    })
    assert.ok(platformApiAlias)
    assert.equal(platformApiAlias.replacement, packageRequire.resolve('@tarojs/plugin-platform-h5/dist/runtime/apis'))

    const routerAlias = config.resolve.alias.find((alias) => {
        return alias.find instanceof RegExp && alias.find.test('@tarojs/router')
    })
    assert.ok(routerAlias)
    assert.equal(routerAlias.replacement, packageRequire.resolve('@tarojs/router/dist/index.esm.js'))

    const babelPlugin = config.plugins.find((plugin) => plugin.name === '@rolldown/plugin-babel')
    assert.ok(babelPlugin)
    assert.ok(babelPlugin.transform && typeof babelPlugin.transform === 'object')
    assert.deepEqual(babelPlugin.transform.filter?.code, [h5TaroApiTransformCodeFilter])

    const optimizerPlugins = config.optimizeDeps.rolldownOptions?.plugins
    assert.ok(Array.isArray(optimizerPlugins))
    assert.equal(optimizerPlugins.length, 1)
})

test('executes the H5 Taro API preset against default and named facade imports', () => {
    const result = transformSync(
        `
            import Taro, { showToast } from 'virtual:taro/api'
            export const notify = () => [Taro.showToast, showToast]
        `,
        {
            babelrc: false,
            configFile: false,
            filename: '/src/page.tsx',
            ...h5TaroApiPreset()
        }
    )

    assert.ok(result?.code)
    assert.match(result.code, /import Taro, \{ showToast as _showToast \} from 'virtual:taro\/api'/)
    assert.doesNotMatch(result.code, /Taro\.showToast/)
    assert.match(result.code, /\[_showToast, _showToast\]/)
})

test('routes only Taro API and possible H5 ARIA modules through Babel', () => {
    const transformedSources = [
        "import Taro from 'virtual:taro/api'",
        "import { useLaunch } from 'virtual:taro/api'",
        'const view = <View ariaLabel="Navigation" />',
        'const view = <View ariaFutureAttribute />'
    ]
    const bypassedSources = [
        "import { View } from 'virtual:taro/components'",
        'export function Calculator() { return <View className="calculator" /> }',
        "const label = 'aria-label'"
    ]

    transformedSources.forEach((code) => {
        assert.match(code, h5TaroApiTransformCodeFilter)
    })
    bypassedSources.forEach((code) => {
        assert.doesNotMatch(code, h5TaroApiTransformCodeFilter)
    })
})
