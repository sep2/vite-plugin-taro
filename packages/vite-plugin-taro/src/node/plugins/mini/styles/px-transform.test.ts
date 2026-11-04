import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { compile } from '@tailwindcss/node'
import unitConverter, { presets } from 'postcss-rule-unit-converter'
import { build } from 'vite'
import { createMemoryBuildProject } from '../../../tests/create-memory-build-project.ts'
import { createMiniStyleEntries } from '../../../tests/create-mini-style-entries.ts'
import { createMiniTransformer } from './create-mini-transformer.ts'
import { minifyMiniStylesheet } from './minify-mini-stylesheet.ts'
import { createMiniStylePlugin } from './plugins.ts'

test('converts Mini CSS units with the fixed 750 design width', async () => {
    const source = '.sizes { width: 100px; padding: 1rem; border-bottom-width: 1px; }'
    const transformed = await createMiniTransformer().transformStylesheet(source)

    assert.match(transformed, /\.sizes \{ width: 100rpx; padding: 32rpx; border-bottom-width: 1rpx; \}/)
    const minified = await minifyMiniStylesheet(transformed, { filename: 'global.wxss', minify: true })
    assert.match(minified, /\.sizes\{width:100rpx;padding:32rpx;border-bottom-width:1rpx\}/)
})

for (const target of ['wx', 'h5'] as const) {
    test(`documented postcss-rule-unit-converter configuration converts ${target} CSS before output`, async () => {
        using project = createMemoryBuildProject({
            'app.js': "import './app.css'\n",
            'app.css': '.sizes { width: 100px; height: 100rpx; padding: 1rem; border-bottom-width: 1px; }'
        })
        const entry = path.join(project.root, 'app.js')

        const result = await build({
            root: project.root,
            configFile: false,
            logLevel: 'silent',
            css: {
                postcss: {
                    plugins: [
                        unitConverter({
                            rules:
                                target === 'h5'
                                    ? [
                                          presets.pxToVw({ viewportWidth: 375 }),
                                          presets.rpxToVw({ viewportWidth: 375, ratio: 1 })
                                      ]
                                    : [presets.pxToRpx({ ratio: 2 })]
                        })
                    ]
                }
            },
            plugins: [
                project.plugin,
                target === 'wx' &&
                    createMiniStylePlugin(
                        { styles: { appFileName: 'app.wxss', globalFileName: 'assets/global.wxss' } },
                        createMiniStyleEntries(entry, [])
                    )
            ],
            build: {
                write: false,
                cssCodeSplit: false,
                cssMinify: false,
                rolldownOptions: { input: entry }
            }
        })

        assert.ok(!Array.isArray(result) && 'output' in result)
        const stylesheet = result.output.find(
            (asset) =>
                asset.type === 'asset' &&
                (target === 'wx' ? asset.fileName === 'assets/global.wxss' : asset.fileName.endsWith('.css'))
        )
        assert.ok(stylesheet?.type === 'asset')
        assert.match(
            String(stylesheet.source),
            target === 'wx'
                ? /\.sizes \{ width: 200rpx; height: 100rpx; padding: 32rpx; border-bottom-width: 2rpx; \}/
                : /\.sizes \{ width: 26\.66667vw; height: 26\.66667vw; padding: 1rem; border-bottom-width: 0\.26667vw; \}/
        )
    })
}

test('converts Tailwind arbitrary pixel border widths to rpx', async () => {
    const compiler = await compile('@tailwind utilities;', { base: process.cwd(), onDependency() {} })
    const css = compiler.build(['border-b-[1px]', 'border-b-[length:1px]'])
    const transformed = await createMiniTransformer().transformStylesheet(css)

    assert.match(transformed, /border-bottom-width: 1rpx;/)
    const minified = await minifyMiniStylesheet(transformed, { filename: 'global.wxss', minify: true })
    assert.match(minified, /border-bottom-width:1rpx/)
})
