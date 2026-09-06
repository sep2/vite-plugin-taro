import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveConfig } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { packageRequire } from '../../utils/packages.ts'
import { createH5TargetPlugins, resolveH5OptimizerTaro } from './plugins.ts'

const options: VptOptions = {
    target: 'h5',
    app: 'src/app.tsx',
    pages: [],
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
}

test('configures H5 runtime resolution and optimization', async () => {
    const config = await resolveConfig(
        {
            configFile: false,
            plugins: createH5TargetPlugins(options)
        },
        'serve'
    )

    assert.deepEqual(config.optimizeDeps.include, [
        'vite-plugin-taro-runtime/plugin-platform-h5/runtime/apis',
        'vite-plugin-taro-runtime/plugin-framework-react/runtime',
        'vite-plugin-taro-runtime/router',
        'vite-plugin-taro-runtime/runtime/h5',
        'react-dom/client'
    ])
    assert.deepEqual(config.optimizeDeps.exclude, [])

    const copiedAliases = [
        ['@tarojs/plugin-platform-h5/dist/runtime/apis', 'vite-plugin-taro-runtime/plugin-platform-h5/runtime/apis'],
        [
            '@tarojs/plugin-platform-h5/dist/definition.json',
            'vite-plugin-taro-runtime/plugin-platform-h5/definition.json'
        ],
        ['@tarojs/plugin-framework-react/dist/runtime', 'vite-plugin-taro-runtime/plugin-framework-react/runtime'],
        ['@tarojs/runtime', 'vite-plugin-taro-runtime/runtime/h5'],
        ['@tarojs/router', 'vite-plugin-taro-runtime/router'],
        ['@tarojs/api', 'vite-plugin-taro-runtime/api'],
        ['@tarojs/taro-h5/dist/api/taro', 'vite-plugin-taro-runtime/taro-h5/dist/api/taro'],
        ['@tarojs/taro-h5/dist/api/index', 'vite-plugin-taro-runtime/taro-h5/dist/api/index'],
        ['@tarojs/components/global.css', 'vite-plugin-taro-runtime/components/global.css'],
        [
            '@tarojs/components/dist/taro-components/taro-components.css',
            'vite-plugin-taro-runtime/components/dist/taro-components/taro-components.css'
        ],
        ['@tarojs/components', 'vite-plugin-taro-runtime/components'],
        ['@tarojs/components/dist/components', 'vite-plugin-taro-runtime/components/dist/components']
    ] as const
    copiedAliases.forEach(([request, replacement]) => {
        const alias = config.resolve.alias.find((entry) => entry.find instanceof RegExp && entry.find.test(request))
        assert.ok(alias)
        assert.ok(alias.find instanceof RegExp)
        assert.equal(alias.find.test(replacement), true)
        assert.equal(alias.find.test(`${replacement}/unrelated`), false)
        assert.equal(alias.replacement, packageRequire.resolve(replacement))
    })

    assert.equal(
        config.plugins.some((plugin) => plugin.name === '@rolldown/plugin-babel'),
        false
    )
    assert.equal(
        config.plugins.some((plugin) => plugin.name === 'vpt:h5-taro-api'),
        false
    )
    assert.equal(
        config.plugins.some((plugin) => plugin.name === 'vpt:h5-aria'),
        false
    )

    const optimizerPlugins = config.optimizeDeps.rolldownOptions?.plugins
    assert.ok(Array.isArray(optimizerPlugins))
    assert.equal(optimizerPlugins.length, 2)
})

test('shares the H5 backend with optimized dependencies without importing the application facade', () => {
    assert.equal(
        resolveH5OptimizerTaro('@tarojs/taro'),
        packageRequire.resolve('vite-plugin-taro-runtime/plugin-platform-h5/runtime/apis')
    )
    assert.equal(resolveH5OptimizerTaro('virtual:taro/api'), undefined)
})
