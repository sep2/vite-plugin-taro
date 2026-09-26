import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build, normalizePath, resolveConfig } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { packageRequire, resolveTaroRuntime } from '../../utils/packages.ts'
import { wrapPluginTransform } from '../../utils/vite.ts'
import { h5AppPath } from './constant.ts'
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
    const applicationAdapter = config.plugins.find((plugin) => plugin.name === 'vpt:h5-stencil-client')
    assert.ok(applicationAdapter)
    assert.ok(applicationAdapter.transform && typeof applicationAdapter.transform === 'object')
    assert.ok(applicationAdapter.transform.filter)
    const optimizerAdapter = optimizerPlugins.find(
        (plugin) => plugin && typeof plugin === 'object' && 'name' in plugin && plugin.name === 'vpt:h5-stencil-client'
    )
    assert.ok(optimizerAdapter && typeof optimizerAdapter === 'object' && 'transform' in optimizerAdapter)
    assert.deepEqual(optimizerAdapter.transform, applicationAdapter.transform)
})

test('native filtering specializes only exact and query-suffixed H5 App IDs', async () => {
    const appId = normalizePath(h5AppPath)
    const eligibleIds = new Set([appId, `${appId}?v=1`, `${appId}?import&v=2`])
    const sourceIds = new Set([
        ...eligibleIds,
        `${appId}.backup.ts`,
        `${appId}/nested.ts`,
        `/fixture${appId}`,
        '/fixture/src/app.tsx',
        `/fixture/src/app.tsx?original=${appId}`
    ])
    const source = `export const config = __VPT_H5_APP_CONFIG__
export const routes = __VPT_H5_ROUTES__
`
    // Only the real H5 handler appends to this journal; Vite retains its context, ordering, and native filter.
    const calls: string[] = []
    const result = await build({
        configFile: false,
        logLevel: 'silent',
        plugins: [
            ...createH5TargetPlugins(options),
            {
                name: 'test:h5-app-sources',
                enforce: 'pre',
                resolveId: (id) => (sourceIds.has(id) ? id : undefined),
                load: (id) => (sourceIds.has(id) ? source : undefined),
                configResolved(config) {
                    const plugin = config.plugins.find((plugin) => plugin.name === 'vpt:h5')
                    assert.ok(plugin?.transform && typeof plugin.transform === 'object')
                    assert.equal(plugin.transform.order, 'pre')
                    wrapPluginTransform(
                        plugin,
                        (transform) =>
                            function (code, id, options) {
                                calls.push(id)
                                return transform.call(this, code, id, options)
                            }
                    )
                }
            }
        ],
        build: {
            write: false,
            minify: false,
            rolldownOptions: { input: Array.from(sourceIds) }
        }
    })

    assert.deepEqual(calls.toSorted(), Array.from(eligibleIds).toSorted())
    assert.ok(!Array.isArray(result) && 'output' in result)
    const entries = result.output.filter((chunk) => chunk.type === 'chunk' && chunk.isEntry)
    assert.equal(entries.length, sourceIds.size)
    for (const chunk of entries) {
        assert.ok(chunk.type === 'chunk' && chunk.facadeModuleId)
        const untouched = !eligibleIds.has(chunk.facadeModuleId)
        assert.equal(chunk.code.includes('__VPT_H5_APP_CONFIG__'), untouched, chunk.facadeModuleId)
        assert.equal(chunk.code.includes('__VPT_H5_ROUTES__'), untouched, chunk.facadeModuleId)
    }
})

test('shares the H5 backend with optimized dependencies without importing the application facade', () => {
    assert.equal(resolveH5OptimizerTaro('@tarojs/taro'), resolveTaroRuntime('plugin-platform-h5/runtime/apis'))
    assert.equal(resolveH5OptimizerTaro('virtual:taro/api'), undefined)
})
