import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build, createServer } from 'vite'
import { createMemoryBuildProject } from '../../tests/create-memory-build-project.ts'
import { createTestProject } from '../../tests/create-test-project.ts'
import vpt from '../../vpt.ts'

test('serves inert declarations to development client and SSR environments', async (context) => {
    const root = await createTestProject('vpt-api-')
    await mkdir(path.join(root, 'src'))
    await writeFile(path.join(root, 'src/app.tsx'), 'export default function App({ children }) { return children }')
    const server = await createServer({
        root,
        configFile: false,
        cacheDir: path.join(root, 'cache'),
        logLevel: 'silent',
        plugins: [vpt({ target: 'h5', app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })],
        server: { middlewareMode: true, watch: null, ws: false },
        optimizeDeps: { noDiscovery: true }
    })
    try {
        const result = await server.transformRequest('virtual:vpt')
        assert.ok(result)
        const clientModule: typeof import('virtual:vpt') = await import(
            `data:text/javascript,${encodeURIComponent(result.code)}`
        )
        const ssrModule = await server.ssrLoadModule('virtual:vpt')
        const syncFactory = context.mock.fn(() => ({}))
        const asyncFactory = context.mock.fn(async () => ({}))
        for (const module of [clientModule, ssrModule]) {
            const defineVptPage: unknown = module.defineVptPage
            assert.ok(typeof defineVptPage === 'function')
            assert.equal(defineVptPage(syncFactory), undefined)
            assert.equal(defineVptPage(asyncFactory), undefined)
        }
        assert.equal(syncFactory.mock.callCount(), 0)
        assert.equal(asyncFactory.mock.callCount(), 0)
    } finally {
        await server.close()
    }
})

for (const target of ['wx', 'zfb', 'tb', 'tt', 'xhs', 'h5'] as const) {
    test(`${target}: tree shakes application declarations while using the explicit page array`, async () => {
        using project = createMemoryBuildProject({
            'index.html': '<html><body><div id="app"></div></body></html>',
            'src/app.tsx': 'export default function App({ children }) { return children }',
            'src/pages/home.tsx': `
                import { defineVptPage } from 'virtual:vpt'
                import { View } from '@tarojs/components'
                defineVptPage(async () => { throw new Error('CONFIGURATION_ONLY') })
                export default function Home() { return <View>APPLICATION_MARKER</View> }
            `,
            'src/pages/unlisted.tsx': `
                import { defineVptPage } from 'virtual:vpt'
                defineVptPage(() => { throw new Error('UNLISTED_CONFIGURATION') })
                export default function Unlisted() { return null }
            `
        })
        const result = await build({
            root: project.root,
            configFile: false,
            logLevel: 'silent',
            plugins: [
                project.plugin,
                vpt({
                    target,
                    app: 'src/app.tsx',
                    pages: [{ path: 'pages/home', config: { navigationBarTitleText: 'Explicit page' } }],
                    appJson: {},
                    projectConfigJson: {}
                })
            ],
            build: { write: false, minify: false }
        })
        assert.ok(!Array.isArray(result) && 'output' in result)
        const javascript = result.output.flatMap((file) => (file.type === 'chunk' ? [file.code] : [])).join('\n')
        assert.match(javascript, /APPLICATION_MARKER/)
        assert.match(javascript, /pages\/home/)
        assert.doesNotMatch(javascript, /defineVptPage|virtual:vpt|CONFIGURATION_ONLY|UNLISTED_CONFIGURATION/)
        assert.doesNotMatch(javascript, /pages\/unlisted/)
        if (target !== 'h5') {
            const app = result.output.find((file) => file.fileName === 'app.json')
            assert.ok(app?.type === 'asset')
            assert.deepEqual(JSON.parse(String(app.source)).pages, ['pages/home'])
            const page = result.output.find((file) => file.fileName === 'pages/home.json')
            assert.ok(page?.type === 'asset')
            assert.equal(JSON.parse(String(page.source)).navigationBarTitleText, 'Explicit page')
        }
    })
}
