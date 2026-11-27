import assert from 'node:assert/strict'
import test from 'node:test'
import { createLogger } from 'vite'
import { createMiniStyleEntries } from '../../../tests/create-mini-style-entries.ts'
import { createMiniStyleService } from './create-mini-style-service.ts'

for (const cssCodeSplit of [true, false]) {
    test(`style service projects ${cssCodeSplit ? 'split' : 'combined'} output and publishes live graph changes`, async () => {
        const entries = createMiniStyleEntries('app-entry', ['page-entry'], '.wxss')
        const originalEntries = structuredClone(entries)
        const service = createMiniStyleService(
            { styles: { ext: '.wxss' } },
            { root: '/fixture', cssCodeSplit, cssMinify: false, logger: createLogger('silent') }
        )
        // This test-owned graph models changing import edges independently of the retained successful CSS captures.
        const modules = new Map([
            ['/app-entry.js', { importedIds: ['/app.css'], dynamicallyImportedIds: [] }],
            ['/page-entry.js', { importedIds: ['/app.css', '/page.css'], dynamicallyImportedIds: [] }],
            ['/app.css', { importedIds: [], dynamicallyImportedIds: [] }],
            ['/page.css', { importedIds: [], dynamicallyImportedIds: [] }]
        ])
        const graph = {
            resolve: async (id: string) => ({ id: `/${id}.js` }),
            getModuleInfo(id: string) {
                assert.equal(this, graph)
                const edges = modules.get(id)
                return edges ? { ...edges, meta: {} } : null
            }
        }
        const appCss = '.app-style { color: red; }'
        const pageCss = '.page-style { color: blue; }'
        assert.equal(await service.compileStyle(appCss, '/app.css'), undefined)
        assert.equal(await service.compileStyle(pageCss, '/page.css'), undefined)
        service.captureCss(appCss, '/app.css?v=1')
        service.captureCss(pageCss, '/page.css')

        await service.bindEntries(graph, entries)
        assert.deepEqual(entries, originalEntries)

        const artifacts = [{ code: 'export const marker = 1', filename: 'app.js', seq: 7 }]
        const output = await service.finalizeBuild(artifacts, graph)
        assert.deepEqual(output.javaScript, [artifacts[0].code])
        assert.deepEqual(
            output.stylesheets.map(({ fileName }) => fileName),
            ['assets/global.wxss', 'pages/page-0/index.wxss']
        )
        assert.match(output.stylesheets[0].source, /\.app-style/)
        if (cssCodeSplit) {
            assert.doesNotMatch(output.stylesheets[0].source, /\.page-style/)
            assert.match(output.stylesheets[1].source, /\.page-style/)
            assert.doesNotMatch(output.stylesheets[1].source, /\.app-style/)
        } else {
            assert.match(output.stylesheets[0].source, /\.page-style/)
            assert.equal(output.stylesheets[1].source, '')
        }

        // The writer journal records only committed native files; unchanged files retain their publication frontier.
        const published: { fileName: string; source: string }[] = []
        const publish = async (fileName: string, source: string) => {
            published.push({ fileName, source })
        }
        assert.deepEqual(await service.finalizeUpdate(artifacts, publish), artifacts)
        assert.deepEqual(published, output.stylesheets)
        await service.finalizeUpdate(artifacts, publish)
        assert.equal(published.length, 2)

        modules.set('/page-entry.js', { importedIds: [], dynamicallyImportedIds: [] })
        await service.finalizeUpdate(artifacts, publish)
        assert.equal(published.length, 3)
        assert.equal(published[2].fileName, cssCodeSplit ? 'pages/page-0/index.wxss' : 'assets/global.wxss')
        assert.doesNotMatch(published[2].source, /\.page-style/)
        if (cssCodeSplit) {
            assert.equal(published[2].source, '')
        } else {
            assert.match(published[2].source, /\.app-style/)
        }
        const nextModules = new Map([
            ['/next-app-entry.js', { importedIds: ['/app.css'], dynamicallyImportedIds: [] }],
            ['/next-page-entry.js', { importedIds: ['/next.css'], dynamicallyImportedIds: [] }],
            ['/app.css', { importedIds: [], dynamicallyImportedIds: [] }],
            ['/next.css', { importedIds: [], dynamicallyImportedIds: [] }]
        ])
        const nextGraph = {
            resolve: async (id: string) => ({ id: `/next-${id}.js` }),
            getModuleInfo(id: string) {
                assert.equal(this, nextGraph)
                const edges = nextModules.get(id)
                return edges ? { ...edges, meta: {} } : null
            }
        }
        service.captureCss('.new-style { color: green; }', '/next.css')
        await service.bindEntries(nextGraph, entries)
        await service.finalizeUpdate(artifacts, publish)
        assert.equal(published.length, 4)
        assert.equal(published[3].fileName, cssCodeSplit ? 'pages/page-0/index.wxss' : 'assets/global.wxss')
        assert.match(published[3].source, /\.new-style/)
        assert.doesNotMatch(published[3].source, /\.page-style/)
        assert.deepEqual(entries, originalEntries)
        service.dispose()
    })
}
