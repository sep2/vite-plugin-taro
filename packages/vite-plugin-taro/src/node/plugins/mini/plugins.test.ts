import assert from 'node:assert/strict'
import test from 'node:test'
import { build, normalizePath, resolveConfig } from 'vite'
import { wrapPluginTransform } from '../../utils/vite.ts'
import { clientTaroNativeId } from '../client/constant.ts'
import { createWxMiniContract } from '../wx/plugins.ts'
import { createZfbMiniContract } from '../zfb/plugins.ts'
import { createMiniTargetPlugins } from './plugins.ts'

for (const [target, createContract] of [
    ['wx', createWxMiniContract],
    ['zfb', createZfbMiniContract]
] as const) {
    test(`${target}: native filters specialize only App and route-qualified Page capsules`, async () => {
        const contract = createContract({
            target,
            app: 'src/app.tsx',
            pages: [
                { path: 'pages/home/index', config: { title: 'home-config' } },
                { path: 'pages/detail/index', config: { title: 'detail-config' } }
            ],
            appJson: { fixture: 'app-config' },
            projectConfigJson: {}
        })
        const config = await resolveConfig({ configFile: false, plugins: createMiniTargetPlugins(contract) }, 'build')
        const plugin = config.plugins.find((plugin) => plugin.name === 'vpt:mini')
        assert.ok(plugin?.transform && typeof plugin.transform === 'object')
        assert.equal(plugin.transform.order, 'pre')
        const appId = normalizePath(contract.runtime.modules.appCapsule)
        const pageId = normalizePath(contract.runtime.modules.pageCapsule)
        const appSource = 'export const config = __VPT_APP_CONFIG__'
        const pageSource = 'export const route = __VPT_PAGE_PATH__; export const config = __VPT_PAGE_CONFIG__'
        const eligibleSources = [
            { id: appId, code: appSource, marker: 'app-config' },
            { id: `${appId}?v=1`, code: appSource, marker: 'app-config' },
            ...contract.options.pages.map((page) => ({
                id: `${pageId}?route=${encodeURIComponent(page.path)}&v=1`,
                code: pageSource,
                marker: page.path
            }))
        ]
        const sources: ReadonlyMap<string, string> = new Map([
            ...eligibleSources.map(({ id, code }) => [id, code] as const),
            [`${appId}.backup.ts`, appSource],
            [`${pageId}/nested.ts`, pageSource],
            [`/fixture${appId}`, appSource],
            [`/fixture/other.ts?original=${pageId}`, pageSource],
            [normalizePath(contract.runtime.modules.appShell), appSource],
            [normalizePath(contract.runtime.modules.pageShell), pageSource],
            ['/fixture/interface.ts', `export const marker = ${JSON.stringify(clientTaroNativeId)}`]
        ])
        // Count actual JS dispatches while preserving the original native filter, ordering, and Vite context.
        const calls: string[] = []
        wrapPluginTransform(
            plugin,
            (transform) =>
                function (code, id, options) {
                    calls.push(id)
                    return transform.call(this, code, id, options)
                }
        )
        const result = await build({
            configFile: false,
            logLevel: 'silent',
            plugins: [
                {
                    name: 'test:mini-capsule-sources',
                    resolveId: (id) => (sources.has(id) ? id : undefined),
                    load: (id) => sources.get(id)
                },
                // This test owns source dispatch only; placement, rendering, styles, and native output stay out.
                { name: plugin.name, transform: plugin.transform }
            ],
            build: {
                write: false,
                minify: false,
                // Retain fixture exports so the assertions inspect specialized values rather than empty chunks.
                rolldownOptions: { input: Array.from(sources.keys()), preserveEntrySignatures: 'strict' }
            }
        })

        const markers = new Map(eligibleSources.map(({ id, marker }) => [id, marker]))
        assert.deepEqual(calls.toSorted(), Array.from(markers.keys()).toSorted())
        assert.ok(!Array.isArray(result) && 'output' in result)
        const entries = result.output.filter((chunk) => chunk.type === 'chunk' && chunk.isEntry)
        assert.equal(entries.length, sources.size)
        for (const chunk of entries) {
            assert.ok(chunk.type === 'chunk' && chunk.facadeModuleId)
            const marker = markers.get(chunk.facadeModuleId)
            if (marker !== undefined) {
                assert.ok(chunk.code.includes(marker), chunk.facadeModuleId)
                assert.doesNotMatch(chunk.code, /__VPT_(?:APP_CONFIG|PAGE_PATH|PAGE_CONFIG)__/)
            }
        }
    })
}
