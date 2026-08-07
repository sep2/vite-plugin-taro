import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveConfig } from 'vite'
import type { VitePluginTaroOptions } from '../../../options.ts'
import { createH5TargetPlugins } from './plugins.ts'

const options: VitePluginTaroOptions = {
    target: 'h5',
    app: 'src/app.tsx',
    pages: [],
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
}

test('prebundles CommonJS dependencies loaded by the injected H5 runtime', async () => {
    const config = await resolveConfig(
        {
            configFile: false,
            plugins: createH5TargetPlugins(options)
        },
        'serve'
    )

    assert.deepEqual(config.optimizeDeps.include, ['@tarojs/plugin-platform-h5/dist/runtime/apis', 'react-dom/client'])
    assert.deepEqual(config.optimizeDeps.exclude, [])
    const optimizerPlugins = config.optimizeDeps.rolldownOptions?.plugins
    assert.ok(Array.isArray(optimizerPlugins))
    assert.equal(optimizerPlugins.length, 1)
})
