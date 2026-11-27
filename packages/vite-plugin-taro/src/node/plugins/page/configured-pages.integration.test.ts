import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'vite'
import type { VptOptions, VptPageOption } from '../../../options.ts'
import { createMemoryBuildProject } from '../../tests/create-memory-build-project.ts'
import vpt from '../../vpt.ts'

for (const target of ['wx', 'h5'] as const) {
    test(`${target}: rejects configuration without pages`, () => {
        assert.throws(
            // @ts-expect-error Verify the runtime diagnostic for untyped Vite configs.
            () => vpt({ target, app: 'src/app.tsx', appJson: {}, projectConfigJson: {} }),
            /VPT pages option must be an array/
        )
    })
}

const configuredPages: VptPageOption[] = [
    { path: 'pages/detail' },
    { path: 'pages/home', entry: true, prerender: true, config: { marker: 'configured-home' } }
]

for (const [target, styleExtension] of [
    ['wx', 'wxss'],
    ['zfb', 'acss'],
    ['tb', 'acss'],
    ['tt', 'ttss'],
    ['xhs', 'css'],
    ['h5', 'css']
] as const) {
    for (const pages of [[], configuredPages]) {
        const name = pages.length === 0 ? 'empty' : 'configured'
        test(`${target}: builds ${name} pages through the public plugin`, async () => {
            using project = createMemoryBuildProject({
                'index.html': '<html><body><div id="app"></div></body></html>',
                'src/app.tsx': 'export default function App({ children }) { return children }',
                'src/pages/home.tsx': `
                    import { View } from '@tarojs/components'
                    import './home.css'
                    export default function Home() { return <View className="configured-home">Configured home</View> }
                `,
                'src/pages/home.css': '.configured-home { color: red; }',
                'src/pages/detail.tsx': 'export default function Detail() { return "Configured detail" }',
                'src/unlisted.tsx': `
                    import { defineVptPage } from 'virtual:vpt'
                    throw new Error('Unlisted module executed')
                    defineVptPage(() => { throw new Error('Unlisted factory executed') })
                `
            })
            const options: VptOptions = { target, app: 'src/app.tsx', pages, appJson: {}, projectConfigJson: {} }
            const original = structuredClone(options)
            Object.freeze(options)
            Object.freeze(pages)
            const result = await build({
                root: project.root,
                configFile: false,
                logLevel: 'silent',
                plugins: [project.plugin, vpt(options)],
                build: { write: false, minify: false, cssMinify: false }
            })
            assert.ok(!Array.isArray(result) && 'output' in result)
            assert.deepEqual(options, original)
            const routes = pages.length > 0 ? ['pages/home', 'pages/detail'] : []
            const javascript = result.output.flatMap((file) => (file.type === 'chunk' ? [file.code] : [])).join('\n')
            assert.doesNotMatch(javascript, /Unlisted module executed|Unlisted factory executed/)
            if (target === 'h5') {
                assert.match(
                    javascript,
                    routes.length > 0
                        ? /"?pages"?:\s*\[\s*"pages\/home",\s*"pages\/detail"\s*\]/
                        : /"?pages"?:\s*\[\s*\]/
                )
            } else {
                const app = result.output.find((file) => file.fileName === 'app.json')
                assert.ok(app?.type === 'asset')
                assert.deepEqual(JSON.parse(String(app.source)).pages, routes)
            }
            if (routes.length === 0) {
                assert.doesNotMatch(javascript, /Configured home|Configured detail/)
                return
            }
            assert.match(javascript, /Configured home/)
            assert.match(javascript, /Configured detail/)
            if (target === 'h5') {
                assert.match(javascript, /configured-home/)
                assert.ok(
                    result.output.some(
                        (file) =>
                            file.type === 'asset' &&
                            file.fileName.endsWith('.css') &&
                            String(file.source).includes('configured-home')
                    )
                )
                return
            }
            const home = result.output.find((file) => file.fileName === 'pages/home.json')
            assert.ok(home?.type === 'asset')
            assert.equal(JSON.parse(String(home.source)).marker, 'configured-home')
            const style = result.output.find((file) => file.fileName === `pages/home.${styleExtension}`)
            assert.ok(style?.type === 'asset')
            assert.match(String(style.source), /configured-home/)
            const capsule = result.output.find((file) => file.fileName === 'pages/home-capsule.js')
            assert.ok(capsule?.type === 'chunk')
            assert.match(
                capsule.code,
                target === 'tt' || target === 'xhs' ? /"prerender":\s*false/ : /"prerender":\s*true/
            )
        })
    }
}
