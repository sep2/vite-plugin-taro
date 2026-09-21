import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build, normalizePath, type Rolldown } from 'vite'
import { polyfillCases } from '../src/polyfill-cases.ts'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
type BuildOutput = readonly (Rolldown.OutputAsset | Rolldown.OutputChunk)[]

test('builds the TT polyfill demo with native configuration and every selected polyfill', async () => {
    // Vite reads and updates process.env; keep the target, App ID, and NODE_ENV changes inside this test process.
    const previousEnv = process.env
    process.env = { ...previousEnv, VITE_VPT_TARGET: 'tt', VITE_VPT_TIKTOK_APP_ID: 'tt-polyfill-test' }
    try {
        const result = await build({
            root: projectRoot,
            configFile: path.join(projectRoot, 'vite.config.ts'),
            logLevel: 'silent',
            build: { write: false }
        })
        assert.ok(!Array.isArray(result) && 'output' in result)
        const output = result.output

        assert.deepEqual(JSON.parse(asset(output, 'app.json')), {
            pages: ['pages/index/index'],
            window: { navigationBarTitleText: 'Polyfill demo' }
        })
        assert.deepEqual(JSON.parse(asset(output, 'pages/index/index.json')), {
            navigationBarTitleText: 'Polyfill demo',
            usingComponents: { comp: '../../comp', 'custom-wrapper': '../../custom-wrapper' }
        })
        assert.deepEqual(JSON.parse(asset(output, 'project.config.json')), {
            appid: 'tt-polyfill-test',
            projectname: 'polyfill demo',
            miniprogramRoot: './',
            compileHotReload: true,
            setting: { urlCheck: false, es6: false, postcss: false, minified: false, autoCompile: true }
        })
        assert.deepEqual(JSON.parse(asset(output, 'project.private.config.json')), {
            setting: { urlCheck: false }
        })
        for (const fileName of ['base.ttml', 'utils.sjs', 'pages/index/index.ttml', 'assets/global.ttss']) {
            assert.ok(asset(output, fileName).length > 0, fileName)
        }
        assert.match(asset(output, 'app.ttss'), /assets\/global\.ttss/)
        assert.ok(output.some(({ fileName }) => fileName === 'pages/index/index.ttss'))
        assert.equal(
            output.some(({ fileName }) => /\.(?:wxml|wxss|wxs|axml|acss)$/.test(fileName)),
            false
        )
        for (const fileName of ['sitemap.json', 'mini.project.json', '.mini-ide/project-ide.json']) {
            assert.equal(
                output.some((entry) => entry.fileName === fileName),
                false,
                fileName
            )
        }

        const polyfills = output.find((entry) => entry.fileName === 'common/polyfills.js')
        assert.ok(polyfills?.type === 'chunk')
        const moduleIds = polyfills.moduleIds.map(normalizePath)
        for (const { module } of polyfillCases) {
            assert.ok(
                moduleIds.some((id) => id.endsWith(`/core-js/modules/${module}.js`)),
                module
            )
        }
    } finally {
        process.env = previousEnv
    }
})

function asset(output: BuildOutput, fileName: string): string {
    const entry = output.find((entry) => entry.type === 'asset' && entry.fileName === fileName)
    assert.ok(entry?.type === 'asset', `Missing asset: ${fileName}`)
    return typeof entry.source === 'string' ? entry.source : Buffer.from(entry.source).toString('utf8')
}
