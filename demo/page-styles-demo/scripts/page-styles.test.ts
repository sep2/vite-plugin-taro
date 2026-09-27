import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import type { Rolldown } from 'vite'
import { build } from 'vite'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const targets = [
    { target: 'wx', style: 'wxss', template: 'wxml' },
    { target: 'zfb', style: 'acss', template: 'axml' },
    { target: 'tt', style: 'ttss', template: 'ttml' }
] as const

type BuildOutput = readonly (Rolldown.OutputAsset | Rolldown.OutputChunk)[]

for (const { target, style, template } of targets) {
    test(`${target}: splits real demo App, shared, page-only, module, and lazy CSS`, async () => {
        // These tests run sequentially; isolate Vite's target and NODE_ENV mutations from subsequent builds.
        const previousEnv = process.env
        process.env = {
            ...previousEnv,
            VITE_VPT_TARGET: target,
            VITE_VPT_WECHAT_APP_ID: 'wx-page-styles-test',
            VITE_VPT_ALIPAY_APP_ID: 'zfb-page-styles-test',
            VITE_VPT_TIKTOK_APP_ID: 'tt-page-styles-test'
        }
        try {
            const result = await build({
                root: projectRoot,
                configFile: path.join(projectRoot, 'vite.config.ts'),
                logLevel: 'silent',
                build: { write: false }
            })
            assert.ok(!Array.isArray(result) && 'output' in result)
            const output = result.output
            const app = asset(output, `assets/global.${style}`)
            const red = asset(output, `pages/red/red.${style}`)
            const blue = asset(output, `pages/blue/blue.${style}`)
            const plain = asset(output, `pages/plain/plain.${style}`)

            assert.match(asset(output, `app.${style}`), new RegExp(`@import ["']\\./assets/global\\.${style}["']`))
            assert.match(app, /\.app-banner\{/)
            assert.match(app, /\.leak-probe\{/)
            assert.equal((app.match(/\.h5-span/g) ?? []).length, 1, 'HTML defaults belong only to App')
            assert.doesNotMatch(app, /\.(?:page-heading|collision-card|red-only|blue-only|shared-card|lazy-card)\{/)
            assert.equal(plain, '', 'A page without stylesheet imports must have an empty native stylesheet')

            assert.match(red, /\.page-heading\{[^}]*color:red/)
            assert.match(blue, /\.page-heading\{[^}]*color:#00f/)
            assert.match(red, /\.collision-card\{[^}]*border-left:8rpx solid red/)
            assert.match(blue, /\.collision-card\{[^}]*border-left:8rpx solid blue/)
            assert.match(red, /\.red-only\{/)
            assert.match(red, /\.lazy-card\{/)
            assert.match(blue, /\.blue-only\{/)
            assert.doesNotMatch(red, /\.blue-only\{/)
            assert.doesNotMatch(blue, /\.(?:red-only|lazy-card)\{/)

            const moduleClass = red.match(/\.([\w-]*badge[\w-]*)\{/)
            assert.ok(moduleClass, 'Red must include the shared CSS Module')
            const moduleSelector = `.${moduleClass[1]}{`
            assert.ok(blue.includes(moduleSelector), 'The shared module must have the same class identity on Blue')
            assert.ok(!app.includes(moduleSelector), 'The shared module must not become App-global')
            for (const css of [red, blue]) {
                assert.equal((css.match(/\.shared-card\{/g) ?? []).length, 1)
                assert.doesNotMatch(css, /\.(?:app-banner|leak-probe|h5-span)\b/)
            }

            assert.deepEqual(JSON.parse(asset(output, 'app.json')).pages, [
                'pages/red/red',
                'pages/blue/blue',
                'pages/plain/plain'
            ])
            for (const name of ['red', 'blue', 'plain']) {
                assert.ok(asset(output, `pages/${name}/${name}.${template}`).length > 0)
                assert.ok(JSON.parse(asset(output, `pages/${name}/${name}.json`)).usingComponents.comp)
            }
            const javascript = output.flatMap((entry) => (entry.type === 'chunk' ? [entry.code] : [])).join('\n')
            assert.ok(javascript.includes(moduleClass[1]!), 'Rendered CSS Module class must match the native CSS')
        } finally {
            process.env = previousEnv
        }
    })
}

function asset(output: BuildOutput, fileName: string): string {
    const entry = output.find((entry) => entry.type === 'asset' && entry.fileName === fileName)
    assert.ok(entry?.type === 'asset', `Missing asset: ${fileName}`)
    return typeof entry.source === 'string' ? entry.source : Buffer.from(entry.source).toString('utf8')
}
