import assert from 'node:assert/strict'
import test from 'node:test'
import { rolldown } from 'rolldown'
import { build, normalizePath, resolveConfig } from 'vite'
import { wrapPluginTransform } from '../../utils/vite.ts'
import { clientTaroNativeId } from '../client/constant.ts'
import { createTtMiniContract } from '../tt/plugins.ts'
import { createWxMiniContract } from '../wx/plugins.ts'
import { createZfbMiniContract } from '../zfb/plugins.ts'
import { createMiniTargetPlugins } from './plugins.ts'

test('native rendering resolves bootstrap from each output generation rather than an ambient global', async () => {
    const contract = createWxMiniContract({
        target: 'wx',
        app: 'src/app.tsx',
        pages: [],
        appJson: {},
        projectConfigJson: {}
    })
    const config = await resolveConfig({ configFile: false, plugins: createMiniTargetPlugins(contract) }, 'build')
    const plugin = config.plugins.find((candidate) => candidate.name === 'vpt:mini')
    const placement = config.plugins.find((candidate) => candidate.name === 'vpt:mini-placer')
    assert.ok(plugin?.renderChunk)
    assert.ok(placement?.renderStart && placement.renderChunk)
    const { appShell, appCapsule, bootstrap } = contract.runtime.modules
    const sources: ReadonlyMap<string, string> = new Map([
        [appShell, `import config from ${JSON.stringify(appCapsule)}; App(config)`],
        [appCapsule, 'export default { value: 42 }'],
        [bootstrap, 'export const System = fixtureSystem']
    ])
    const plugins = [
        {
            name: 'test:mini-render-sources',
            resolveId: (id: string) => (sources.has(id) ? id : undefined),
            load: (id: string) => sources.get(id)
        },
        { name: placement.name, renderStart: placement.renderStart, renderChunk: placement.renderChunk },
        { name: plugin.name, renderChunk: plugin.renderChunk }
    ]
    const bundle = await rolldown({
        input: { app: appShell, capsule: appCapsule, loader: bootstrap },
        plugins,
        preserveEntrySignatures: 'strict'
    })
    try {
        for (const prefix of ['first', 'second']) {
            const result = await bundle.generate({ format: 'es', entryFileNames: `${prefix}/[name].js` })
            const app = result.output.find((chunk) => chunk.type === 'chunk' && chunk.facadeModuleId === appShell)
            assert.ok(app?.type === 'chunk')
            const value = {}
            // These per-generation journals prove the physical bootstrap path and exactly one shell activation.
            const required: string[] = []
            const registered: unknown[] = []
            Function(
                'require',
                'App',
                'globalThis',
                app.code
            )(
                (id: string) => {
                    required.push(id)
                    return {
                        System: {
                            importSync(moduleId: string) {
                                assert.equal(moduleId, `${prefix}/capsule.js`)
                                return { default: value }
                            }
                        }
                    }
                },
                (config: unknown) => registered.push(config),
                undefined
            )
            assert.deepEqual(required, ['./loader.js'])
            assert.deepEqual(registered, [value])
        }
    } finally {
        await bundle.close()
    }

    // Placement owns generation isolation: a missing entry must not resolve through the preceding output plan.
    const missing = await rolldown({ input: { app: appShell, capsule: appCapsule }, plugins })
    try {
        await assert.rejects(missing.generate({ format: 'es' }), /Mini Program placement is missing entry module:/)
    } finally {
        await missing.close()
    }
})

for (const [target, createContract] of [
    ['wx', createWxMiniContract],
    ['zfb', createZfbMiniContract],
    ['tt', createTtMiniContract]
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
        const config = await resolveConfig(
            { configFile: false, mode: 'development', plugins: createMiniTargetPlugins(contract) },
            'build'
        )
        const plugin = config.plugins.find((plugin) => plugin.name === 'vpt:mini')
        assert.ok(plugin?.transform && typeof plugin.transform === 'object')
        assert.equal(plugin.transform.order, 'pre')
        const appId = normalizePath(contract.runtime.modules.appCapsule)
        const pageId = normalizePath(contract.runtime.modules.pageCapsule)
        const appSource = 'export const config = __VPT_APP_CONFIG__'
        const pageSource =
            'const PageComponent = () => null; export const route = __VPT_PAGE_PATH__; export const config = __VPT_PAGE_CONFIG__; export const component = PageComponent'
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
            mode: 'development',
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
                if (chunk.facadeModuleId.startsWith(pageId)) {
                    assert.doesNotMatch(chunk.code, /resolvePageComponent/)
                }
            }
        }
    })
}
