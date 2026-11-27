import assert from 'node:assert/strict'
import test from 'node:test'
import { rolldown } from 'rolldown'
import { build, normalizePath, type Rolldown, resolveConfig } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { resolveVptRuntime } from '../../utils/packages.ts'
import { wrapPluginTransform } from '../../utils/vite.ts'
import { createAliMiniContract } from '../ali/plugins.ts'
import { clientTaroNativeId } from '../client/constant.ts'
import { createTtMiniContract } from '../tt/plugins.ts'
import { createWxMiniContract } from '../wx/plugins.ts'
import {
    miniAppCapsuleId,
    miniAppShellId,
    miniBootstrapId,
    miniComponentCapsuleId,
    miniComponentShellId,
    miniCustomWrapperShellId,
    miniPageCapsuleId,
    miniPageShellId,
    rendererHostId
} from './module/module.ts'
import { createPlacementRolldownOptions } from './placer/placer.ts'
import { createMiniTargetPlugins } from './plugins.ts'

const infrastructureEntries = [
    { id: miniBootstrapId, name: 'bootstrap' },
    { id: miniAppCapsuleId, fileName: 'app-capsule.js' },
    { id: miniComponentShellId, fileName: 'comp.js' },
    { id: miniComponentCapsuleId, fileName: 'component-capsule.js' },
    { id: miniCustomWrapperShellId, fileName: 'custom-wrapper.js' }
]

test('expands infrastructure and Page entries from the sole App shell input', async () => {
    // Count page reads across plugin creation and successive outputs.
    let pageReads = 0
    const pages = [{ path: 'pages/home/index' }, { path: 'pages/detail/index' }]
    const contract = createWxMiniContract({
        target: 'wx',
        app: 'src/app.tsx',
        get pages() {
            pageReads += 1
            return pages
        },
        appJson: {},
        projectConfigJson: {}
    })
    const plugins = createMiniTargetPlugins(contract)
    assert.equal(pageReads, 1)
    const config = await resolveConfig({ configFile: false, plugins }, 'build')
    const compiler = config.plugins.find((plugin) => plugin.name === 'vpt:mini')
    assert.ok(typeof compiler?.renderStart === 'function')
    const renderStart = compiler.renderStart
    const load = compiler.load
    assert.ok(load && typeof load === 'object')
    assert.deepEqual(config.build.rolldownOptions.input, { 'app.js': miniAppShellId })
    assert.equal(pageReads, 1)
    // Count entry bindings across successive native output passes.
    let outputs = 0
    const bundle = await rolldown({
        ...createPlacementRolldownOptions(),
        input: config.build.rolldownOptions.input,
        treeshake: false,
        plugins: [
            {
                name: compiler.name,
                renderStart(...args) {
                    outputs += 1
                    for (const id of [
                        miniAppCapsuleId,
                        ...pages.map((page) => `${miniPageCapsuleId}?route=${encodeURIComponent(page.path)}`)
                    ]) {
                        assert.ok(this.getModuleInfo(normalizePath(id)), 'Style roots are loaded before binding')
                    }
                    return Reflect.apply(renderStart, this, args)
                },
                load: {
                    ...load,
                    handler(...args) {
                        return Reflect.apply(
                            load.handler,
                            { environment: { config }, emitFile: (file: Rolldown.EmittedFile) => this.emitFile(file) },
                            args
                        )
                    }
                }
            },
            {
                name: 'test:resolved-entry-sources',
                resolveId: normalizePath,
                load: (id) => `export const source = ${JSON.stringify(id)}`
            }
        ]
    })
    try {
        const output = await bundle.generate({ format: 'es' })
        assert.equal(outputs, 1)
        const nextOutput = await bundle.generate({ format: 'es' })
        assert.equal(outputs, 2)
        assert.deepEqual(
            nextOutput.output.map((file) => file.fileName),
            output.output.map((file) => file.fileName)
        )
        assert.equal(pageReads, 1)
        const pageEntries = pages.flatMap((page) => [
            { id: `${miniPageShellId}?route=${encodeURIComponent(page.path)}`, fileName: `${page.path}.js` },
            { id: `${miniPageCapsuleId}?route=${encodeURIComponent(page.path)}`, fileName: `${page.path}-capsule.js` }
        ])
        for (const entry of [...infrastructureEntries, ...pageEntries]) {
            const chunk = output.output.find(
                (file) => file.type === 'chunk' && file.facadeModuleId === normalizePath(entry.id)
            )
            assert.ok(chunk?.type === 'chunk' && chunk.isEntry, entry.id)
            if (entry.fileName !== undefined) {
                assert.equal(chunk.fileName, entry.fileName)
            }
        }
        assert.deepEqual(
            output.output
                .flatMap((chunk) => (chunk.type === 'chunk' && chunk.isEntry ? [chunk.facadeModuleId] : []))
                .sort(),
            [miniAppShellId, ...infrastructureEntries.map((entry) => entry.id), ...pageEntries.map((entry) => entry.id)]
                .map(normalizePath)
                .sort()
        )
    } finally {
        await bundle.close()
    }
})

test('validates pages when creating the Mini plugins', () => {
    assert.throws(
        () =>
            createMiniTargetPlugins(
                createWxMiniContract({
                    target: 'wx',
                    app: 'src/app.tsx',
                    pages: [
                        { path: 'pages/first', entry: true },
                        { path: 'pages/second', entry: true }
                    ],
                    appJson: {},
                    projectConfigJson: {}
                })
            ),
        /Only one page may set entry: true/
    )
})

test('native rendering resolves loader from each output generation rather than an ambient global', async () => {
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
    const appShell = miniAppShellId
    const appCapsule = miniAppCapsuleId
    const loader = miniBootstrapId
    const sources: ReadonlyMap<string, string> = new Map([
        [appShell, `import config from ${JSON.stringify(appCapsule)}; App(config)`],
        [appCapsule, 'export default { value: 42 }'],
        [loader, 'export const System = fixtureSystem']
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
        input: { app: appShell, capsule: appCapsule, loader },
        plugins,
        preserveEntrySignatures: 'strict'
    })
    try {
        for (const prefix of ['first', 'second']) {
            const result = await bundle.generate({ format: 'es', entryFileNames: `${prefix}/[name].js` })
            const app = result.output.find((chunk) => chunk.type === 'chunk' && chunk.facadeModuleId === appShell)
            assert.ok(app?.type === 'chunk')
            const value = {}
            // These per-generation journals prove the physical loader path and exactly one shell activation.
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
    ['zfb', createAliMiniContract],
    ['tt', createTtMiniContract]
] as const) {
    test(`${target}: selects the target host while preserving public renderer options`, () => {
        for (const selection of [{}, { renderer: 'template' }, { renderer: 'dom' }] as const) {
            const options: VptOptions = Object.freeze({
                target,
                app: 'src/app.tsx',
                pages: [],
                appJson: {},
                projectConfigJson: {},
                ...selection
            })
            const contract = createContract(options)

            assert.equal(
                contract.taro.hostPath,
                resolveVptRuntime(
                    target !== 'zfb' && options.renderer === 'dom'
                        ? `${target}/renderer-host`
                        : 'mini/template/template-host'
                )
            )
            assert.strictEqual(contract.options, options)
            assert.equal(Object.hasOwn(options, 'renderer'), Object.hasOwn(selection, 'renderer'))
        }
    })

    test(`${target}: merges target defines over shared defaults in build and serve`, async () => {
        const contract = createContract({
            target,
            app: 'src/app.tsx',
            pages: [],
            appJson: {},
            projectConfigJson: {}
        })
        const originalDefine = { ...contract.define }

        const define = Object.freeze({
            ...originalDefine,
            __VPT_TARGET_TEST__: JSON.stringify(target),
            ENABLE_SIZE_APIS: 'false'
        })
        for (const command of ['build', 'serve'] as const) {
            const config = await resolveConfig(
                { configFile: false, plugins: createMiniTargetPlugins({ ...contract, define }) },
                command
            )

            assert.ok(config.define)
            assert.equal(config.define.__VPT_TARGET_TEST__, JSON.stringify(target))
            assert.equal(config.define.ENABLE_SIZE_APIS, 'false')
            assert.equal(config.define.ENABLE_CLONE_NODE, 'true')
            assert.equal(config.define['process.env.TARO_ENV'], JSON.stringify(contract.taro.env))
        }
        assert.deepEqual(contract.define, originalDefine)
    })

    for (const command of ['build', 'serve'] as const) {
        test(`${target}: ${command} binds styles on each output from the App-owned entries`, async () => {
            for (const pages of [[], [{ path: 'pages/home/index' }, { path: 'pages/detail/index' }]]) {
                // Verify that App loads and output-only passes consume the initialized snapshot.
                let pageReads = 0
                // Replace the input after initialization to distinguish it from the retained snapshot.
                let currentPages = pages
                const contract = createContract({
                    target,
                    app: 'src/app.tsx',
                    get pages() {
                        pageReads += 1
                        return currentPages
                    },
                    appJson: {},
                    projectConfigJson: {}
                })
                const config = await resolveConfig(
                    { configFile: false, plugins: createMiniTargetPlugins(contract) },
                    command
                )
                assert.equal(config.build.cssCodeSplit, false)
                const compiler = config.plugins.find((plugin) => plugin.name === 'vpt:mini')
                assert.ok(typeof compiler?.renderStart === 'function')
                assert.deepEqual(config.build.rolldownOptions.input, { 'app.js': miniAppShellId })
                assert.equal(pageReads, 1)
                assert.ok(compiler.load && typeof compiler.load === 'object')
                assert.ok(typeof compiler.resolveId === 'function')
                assert.equal(
                    Reflect.apply(compiler.resolveId, { environment: { config } }, [miniAppShellId, undefined]),
                    undefined
                )
                assert.equal(
                    Reflect.apply(compiler.resolveId, { environment: { config } }, [rendererHostId, undefined]),
                    contract.taro.hostPath
                )
                assert.equal(pageReads, 1)
                // Record emitted entries and style roots to verify both environments use the same page graph.
                const emitted: Rolldown.EmittedFile[] = []
                const entryIds: string[] = []
                const loadContext = {
                    environment: { config },
                    emitFile(file: Rolldown.EmittedFile) {
                        emitted.push(file)
                        return ''
                    }
                }
                Reflect.apply(compiler.load.handler, loadContext, [miniAppShellId])
                const renderContext = {
                    async resolve(id: string) {
                        entryIds.push(id)
                        return { id: normalizePath(id) }
                    }
                }
                assert.deepEqual(emitted, [
                    ...infrastructureEntries.map((entry) => ({ type: 'chunk', ...entry })),
                    ...pages.flatMap((page) => [
                        {
                            type: 'chunk',
                            id: `${miniPageShellId}?route=${encodeURIComponent(page.path)}`,
                            fileName: `${page.path}.js`
                        },
                        {
                            type: 'chunk',
                            id: `${miniPageCapsuleId}?route=${encodeURIComponent(page.path)}`,
                            fileName: `${page.path}-capsule.js`
                        }
                    ])
                ])
                // Model successive outputs reusing the entries registered by one App load.
                for (let output = 0; output < 2; output++) {
                    entryIds.length = 0
                    await Reflect.apply(compiler.renderStart, renderContext, [])
                    assert.deepEqual(entryIds, [
                        miniAppCapsuleId,
                        ...pages.map((page) => `${miniPageCapsuleId}?route=${encodeURIComponent(page.path)}`)
                    ])
                }
                assert.equal(pageReads, 1)
                currentPages = [{ path: 'pages/updated/index' }]
                const registered = [...emitted]
                emitted.length = 0
                await Reflect.apply(compiler.load.handler, loadContext, [miniAppShellId])
                assert.equal(pageReads, 1)
                assert.deepEqual(emitted, registered)
                entryIds.length = 0
                await Reflect.apply(compiler.renderStart, renderContext, [])
                assert.deepEqual(entryIds, [
                    miniAppCapsuleId,
                    ...pages.map((page) => `${miniPageCapsuleId}?route=${encodeURIComponent(page.path)}`)
                ])
            }
        })
    }

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
        assert.equal(config.build.reportCompressedSize, false)
        const plugin = config.plugins.find((plugin) => plugin.name === 'vpt:mini')
        assert.ok(plugin?.transform && typeof plugin.transform === 'object')
        assert.equal(plugin.transform.order, 'pre')
        assert.ok(plugin.load && typeof plugin.load === 'object')
        await Reflect.apply(plugin.load.handler, { environment: { config }, emitFile: () => '' }, [miniAppShellId])
        const appId = normalizePath(miniAppCapsuleId)
        const pageId = normalizePath(miniPageCapsuleId)
        const appSource = 'export const config = __VPT_APP_CONFIG__'
        const pageSource =
            'const PageComponent = () => null; export const options = __VPT_PAGE_OPTIONS__; export const component = PageComponent'
        const eligibleSources = [
            { id: appId, code: appSource, marker: 'app-config' },
            { id: `${appId}?v=1`, code: appSource, marker: 'app-config' },
            ...contract.options.pages!.map((page) => ({
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
            [normalizePath(miniAppShellId), appSource],
            [normalizePath(miniPageShellId), pageSource],
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
                assert.doesNotMatch(chunk.code, /__VPT_(?:APP_CONFIG|PAGE_OPTIONS)__/)
                if (chunk.facadeModuleId.startsWith(pageId)) {
                    assert.doesNotMatch(chunk.code, /resolvePageComponent/)
                }
            }
        }
    })
}
