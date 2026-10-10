import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import type { PageInstance } from 'vite-plugin-taro-runtime/runtime/mini'
import { createDevtoolsHmrRuntime } from '../mini/dev/modes/devtools/devtools-runtime.ts'
import type { createVptPage, VptPageOptions } from '../mini/taro/create-vpt-page.ts'
import {
    bundleRuntimeEntry,
    type Call,
    createExecutionContext,
    executeRuntimeEntry,
    recordCall,
    runtimeRoot
} from './runtime-entry-test-utils.ts'

// Mock only the capsule's bridge; renderer tests exercise these calls against real React and Taro.
const prerenderRuntimeMock = `
    export const createPageConfig = globalThis.harness.createPageConfig
    export const Current = globalThis.harness.Current
    export const document = globalThis.harness.document
    export const hydrate = globalThis.harness.hydrate
    export const incrementId = () => {
        // Each test capsule owns a deterministic instance counter.
        let id = 0
        return () => ++id
    }
    export const getPath = (route, params) => route + '?instance=' + params.$vptPage
    export const addLeadingSlash = route => '/' + route
    export const getOnReadyEventKey = route => route + '.onReady'
    export const getOnShowEventKey = route => route + '.onShow'
    export const getOnHideEventKey = route => route + '.onHide'
`

test('creates the Mini Program Page capsule after App initialization with one options object', async () => {
    // This mutable journal captures App-before-Page initialization and the two-argument factory contract.
    const calls: Call[] = []
    const appConfigInput = { pages: ['pages/home/index'] }
    const vptPageOptions = { path: 'pages/home/index', config: { navigationBarTitleText: 'Home' } }
    const appConfig = { kind: 'app-config' }
    const pageConfig = { kind: 'page-config' }
    const AppComponent = { kind: 'AppComponent' }
    const PageComponent = { kind: 'PageComponent' }
    const harness = {
        appConfigInput,
        vptPageOptions,
        AppComponent,
        PageComponent,
        createVptApp: recordCall(calls, 'createVptApp', appConfig),
        createVptPage: recordCall(calls, 'createVptPage', pageConfig)
    }
    const code = await bundleRuntimeEntry({
        entry: 'mini/capsule/page.ts',
        mocks: {
            '../taro/taro-runtime.ts': `
                const harness = globalThis.harness
                export const createVptApp = harness.createVptApp
                export const createVptPage = harness.createVptPage
            `,
            '\0vpt:app-component': 'export default globalThis.harness.AppComponent',
            '\0vpt:page-component': 'export default globalThis.harness.PageComponent'
        },
        defines: {
            __VPT_APP_CONFIG__: 'globalThis.harness.appConfigInput',
            __VPT_PAGE_OPTIONS__: 'globalThis.harness.vptPageOptions'
        }
    })

    const exports = executeRuntimeEntry(code, createExecutionContext(harness))

    assert.strictEqual(exports.default, pageConfig)
    assert.deepEqual(
        calls.map(({ name }) => name),
        ['createVptApp', 'createVptPage']
    )
    assert.deepEqual(Object.keys(exports), ['default'])
    assert.deepEqual(calls[0]?.args, [AppComponent, appConfigInput])
    assert.deepEqual(calls[1]?.args, [PageComponent, vptPageOptions])
    assert.strictEqual(calls[1]?.args[1], vptPageOptions)
})

test('createVptPage forwards optional Page config through the shared options type', async (t) => {
    const options: Parameters<typeof createVptPage>[1][] = [
        { path: 'pages/home/index', prerender: false },
        { path: 'pages/home/index', config: { navigationBarTitleText: 'Home' }, prerender: false }
    ] satisfies VptPageOptions[]
    const bundle = await bundleRuntimeEntry({
        entry: 'mini/taro/create-vpt-page.ts',
        mocks: {
            'vite-plugin-taro-runtime/runtime/mini':
                'export const createPageConfig = globalThis.harness.createPageConfig',
            './prerender-to-data.ts': 'export const prerenderToData = () => { throw new Error("Unexpected prerender") }'
        },
        defines: {}
    })
    for (const pageOptions of options) {
        const createPageConfig = t.mock.fn((...args: unknown[]) => ({ data: args[2] }))
        const exports = executeRuntimeEntry(bundle, createExecutionContext({ createPageConfig }))
        const createPage = exports.createVptPage
        assert.ok(typeof createPage === 'function')
        const component = () => null
        const config = createPage(component, pageOptions)
        const args = createPageConfig.mock.calls[0]?.arguments
        assert.equal(createPageConfig.mock.callCount(), 1)
        assert.deepEqual(args, [component, pageOptions.path, config.data, pageOptions.config])
        assert.strictEqual(args?.[3], pageOptions.config)
        assert.equal(Object.hasOwn(pageOptions, 'config'), pageOptions.config !== undefined)
    }
})

test('Taro PageInstance accepts native data objects and factories without a VPT type override', () => {
    const seed = { app: { cn: [] }, page: { cn: [] } }
    // Native registration may replace only this field while retaining the original Page config.
    const config: PageInstance = { data: seed }
    assert.strictEqual(config.data, seed)
    config.data = () => seed
    assert.strictEqual(config.data(), seed)
    config.data = undefined
    assert.equal(config.data, undefined)
})

test('prerender stores its identity inside the non-enumerable VPT metadata', async () => {
    // The journal captures mount/lookup/serialization order without replacing any native lifecycle.
    const calls: Call[] = []
    const component = () => null
    const app = { cn: [{ sid: 'app-child' }] }
    const page = { parentNode: { _root: app }, cn: [{ sid: 'page-child' }] }
    const code = await bundleRuntimeEntry({
        entry: 'test/prerender-fixture.ts',
        mocks: {
            [path.join(runtimeRoot, 'test/prerender-fixture.ts')]: `
                export { createVptPage } from ${JSON.stringify(path.join(runtimeRoot, 'mini/taro/create-vpt-page.ts'))}
                export { prerenderToData } from ${JSON.stringify(path.join(runtimeRoot, 'mini/taro/prerender-to-data.ts'))}
            `,
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            'vite-plugin-taro-runtime/react': 'export const flushSync = globalThis.harness.flushSync',
            './get-page-query.ts': 'export const getPageQuery = () => ({ id: "example" })'
        },
        defines: {}
    })

    for (const host of [null, { parentNode: null }, page]) {
        // Reset between independent committed, suspended and detached host observations.
        calls.length = 0
        const harness = {
            PageComponent: component,
            createPageConfig(...args: unknown[]) {
                calls.push({ name: 'createPageConfig', args })
                return { data: args[2] }
            },
            Current: {
                app: {
                    mount(...args: [unknown, string, () => void]) {
                        assert.equal(args.length, 3, 'prerender uses the original mount signature')
                        const [value, path, callback] = args
                        calls.push({ name: 'mount', args: [value, path] })
                        callback()
                    }
                }
            },
            flushSync(callback: () => void) {
                calls.push({ name: 'flushSync', args: [] })
                callback()
                calls.push({ name: 'commit', args: [] })
            },
            document: { getElementById: recordCall(calls, 'lookup', host) },
            hydrate(value: { cn: object[] }) {
                calls.push({ name: 'hydrate', args: [value] })
                return { cn: value.cn }
            }
        }
        const { createVptPage, prerenderToData } = executeRuntimeEntry(code, createExecutionContext(harness))
        assert.ok(typeof createVptPage === 'function')
        assert.ok(typeof prerenderToData === 'function')
        const config = createVptPage(component, { path: 'pages/example' })
        assert.equal(Object.getOwnPropertyDescriptor(config, '__vpt_meta')?.enumerable, false)
        assert.equal(Object.hasOwn({ ...config }, '__vpt_meta'), false)
        assert.deepEqual(Object.keys(config), ['data'])
        assert.deepEqual(config.__vpt_meta, {})
        assert.deepEqual(Object.getOwnPropertyNames(config), ['data', '__vpt_meta'])
        assert.deepEqual(
            calls.map(({ name }) => name),
            ['createPageConfig'],
            'registration must not render'
        )
        const seed: unknown = Reflect.get(config, 'data')
        assert.strictEqual(seed, calls[0]?.args[2])
        assert.equal(Object.hasOwn(config, 'prerenderToData'), false)
        assert.equal(calls[0]?.args.length, 4, 'no identity-reader argument is added to createPageConfig')

        // Observe per-instance work only after config construction has completed.
        calls.length = 0
        const result = prerenderToData(config, component, 'pages/example', seed)
        const router = Reflect.get(harness.Current, 'router')
        const initialPage = config.__vpt_meta.prerenderIdentity
        assert.deepEqual(initialPage, { path: 'pages/example?instance=1', params: router.params })
        assert.strictEqual(initialPage.params, router.params)
        assert.equal(router.params.id, 'example')
        assert.equal(Object.hasOwn({ ...config }, '__vpt_meta'), false)
        assert.deepEqual(Object.getOwnPropertyNames(config), ['data', '__vpt_meta'])
        assert.deepEqual(calls.slice(0, 4), [
            { name: 'flushSync', args: [] },
            { name: 'mount', args: [component, 'pages/example?instance=1'] },
            { name: 'commit', args: [] },
            { name: 'lookup', args: ['pages/example?instance=1'] }
        ])
        if (host === page) {
            assert.deepEqual(calls.slice(4), [
                { name: 'hydrate', args: [app] },
                { name: 'hydrate', args: [page] }
            ])
            assert.deepEqual(result, {
                app: { nn: 'vpt_fragment', cn: app.cn },
                page: { cn: page.cn }
            })
        } else {
            assert.strictEqual(result, seed, 'uncommitted hosts keep the seed for normal onLoad mounting')
            assert.equal(calls.length, 4)
        }
        assert.deepEqual(seed, { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } })
        prerenderToData(config, component, 'pages/example', seed)
        assert.equal(
            config.__vpt_meta.prerenderIdentity.path,
            'pages/example?instance=2',
            'identical queries use distinct instances'
        )
    }
})

test('prerender preserves its seed and routing state until the App provides mount', async () => {
    const code = await bundleRuntimeEntry({
        entry: 'mini/taro/prerender-to-data.ts',
        mocks: {
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            'vite-plugin-taro-runtime/react': 'export const flushSync = globalThis.harness.unexpected',
            './get-page-query.ts': 'export const getPageQuery = globalThis.harness.unexpected'
        },
        defines: {}
    })
    for (const app of [undefined, null, {}]) {
        const router = { path: '/existing' }
        const config = { __vpt_meta: {} }
        const seed = { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } }
        const harness = {
            Current: { app, router },
            unexpected: () => assert.fail('An unavailable App must not capture query or render')
        }
        const { prerenderToData } = executeRuntimeEntry(code, createExecutionContext(harness))
        assert.ok(typeof prerenderToData === 'function')
        assert.strictEqual(
            prerenderToData(config, () => null, 'pages/cold', seed),
            seed
        )
        assert.strictEqual(harness.Current.router, router)
        assert.deepEqual(config.__vpt_meta, {})
    }
})

test('mounts the current Page export instead of the cold native capsule baseline in development', async () => {
    const calls: Call[] = []
    function BaselinePage() {
        return null
    }
    function LatestPage() {
        return null
    }
    const config = {}
    const harness = {
        PageComponent: BaselinePage,
        Current: { app: { mount: recordCall(calls, 'mount', undefined) } },
        document: { getElementById: () => null },
        createPageConfig: recordCall(calls, 'createPageConfig', config),
        hot: { accept: recordCall(calls, 'accept', undefined) },
        runtime: {
            resolvePageComponent: (id: string, baseline: unknown) => {
                assert.equal(id, 'src/pages/home/index.tsx')
                assert.strictEqual(baseline, BaselinePage)
                return LatestPage
            }
        }
    }
    const code = await bundleRuntimeEntry({
        entry: 'mini/capsule/page.ts',
        mocks: {
            './app.ts': '',
            './prerender-to-data.ts':
                'export const prerenderToData = () => { throw new Error("Unexpected prerender") }',
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            '../taro/taro-runtime.ts': `export { createVptPage } from ${JSON.stringify(path.join(runtimeRoot, 'mini/taro/create-vpt-page.ts'))}`,
            '\0vpt:global-binding': 'export const vptGlobal = globalThis',
            '\0vpt:page-component': 'export default globalThis.harness.PageComponent'
        },
        defines: {
            __VPT_PAGE_OPTIONS__: JSON.stringify({ path: 'pages/home/index' })
        },
        servePageModuleId: 'src/pages/home/index.tsx'
    })
    const context = createExecutionContext(harness)
    context.globalThis.__rolldown_runtime__ = harness.runtime
    const exports = executeRuntimeEntry(code, context)
    assert.strictEqual(exports.default, config)
    assert.strictEqual(calls[0]?.args[0], LatestPage)
    assert.deepEqual(
        calls.map(({ name }) => name),
        ['createPageConfig', 'accept']
    )
    assert.ok(exports.default && typeof exports.default === 'object')
    assert.deepEqual(Reflect.get(exports.default, '__vpt_meta'), {})
    assert.equal(Object.hasOwn(exports, 'prerenderToData'), false)
})

test('createVptPage selects native data form without copying the config', async (t) => {
    for (const prerender of [undefined, false, true]) {
        // This journal distinguishes capsule construction from data creation and ordinary native lifecycles.
        const calls: Call[] = []
        const page = { data: { count: 0 } }
        const renderedData = { count: 1 }
        const query = { id: '42', undeclared: 'full-query', scene: 'a=b' }
        const share = { title: 'Shared page', path: '/pages/home/index?id=42' }
        const config = {
            data: page.data,
            options: { multipleSlots: true },
            events: { onBack: () => true },
            onLoad(this: unknown, options: unknown) {
                assert.strictEqual(this, page)
                assert.strictEqual(options, query)
                calls.push({ name: 'onLoad', args: [options] })
            },
            onShareAppMessage: () => share,
            eh: recordCall(calls, 'event', undefined)
        } satisfies PageInstance
        const initialPage = { path: 'pages/home/index?instance=1', params: query }
        const prerenderToData = t.mock.fn((value: unknown, component: unknown, route: string, data: unknown) => {
            assert.strictEqual(value, config, 'prerender uses the original Taro config')
            assert.strictEqual(component, calls[1]?.args[0], 'the closure retains the Page component')
            assert.equal(route, 'pages/home/index')
            assert.strictEqual(data, calls[1]?.args[2], 'the factory passes the captured seed, not config.data')
            return renderedData
        })
        const code = await bundleRuntimeEntry({
            entry: 'mini/capsule/page.ts',
            mocks: {
                './app.ts': 'globalThis.harness.initialize()',
                '../taro/taro-runtime.ts': `export { createVptPage } from ${JSON.stringify(path.join(runtimeRoot, 'mini/taro/create-vpt-page.ts'))}`,
                'vite-plugin-taro-runtime/runtime/mini':
                    'export const createPageConfig = globalThis.harness.createPageConfig',
                './prerender-to-data.ts': 'export const prerenderToData = globalThis.harness.prerenderToData',
                '\0vpt:page-component': 'export default () => null'
            },
            defines: {
                __VPT_PAGE_OPTIONS__: JSON.stringify({ path: 'pages/home/index', config: {}, prerender })
            }
        })
        const harness = {
            prerenderToData,
            initialize: recordCall(calls, 'initialize', undefined),
            createPageConfig(...args: unknown[]) {
                calls.push({ name: 'createPageConfig', args })
                Reflect.set(config, 'data', args[2])
                return config
            }
        }
        const nativeConfig = executeRuntimeEntry(code, createExecutionContext(harness)).default
        assert.ok(nativeConfig && typeof nativeConfig === 'object')
        assert.strictEqual(nativeConfig, config, 'both data forms retain the original config identity')
        const seed = calls[1]?.args[2]
        assert.deepEqual(seed, { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } })
        const metadata = Reflect.get(config, '__vpt_meta')
        assert.deepEqual(Object.keys(metadata), [])
        // Configuration and registration must not consume a pending native-instance identity.
        metadata.prerenderIdentity = initialPage
        Object.freeze(metadata)
        Object.freeze(config)
        assert.deepEqual(
            calls.map(({ name }) => name),
            ['initialize', 'createPageConfig']
        )
        assert.equal(calls[1]?.args.length, 4, 'the upstream Taro factory signature is unchanged')
        assert.equal(prerenderToData.mock.callCount(), 0, 'capsule evaluation must not render')
        // Inspect the bundle body, not the test wrapper's lexical host parameters.
        assert.doesNotMatch(code.code.slice(code.code.indexOf('\n')), /process\.env|\bwx\b|registerPage/)
        if (prerender) {
            const data: unknown = Reflect.get(nativeConfig, 'data')
            assert.ok(typeof data === 'function')
            assert.strictEqual(data(), renderedData)
            assert.equal(prerenderToData.mock.callCount(), 1)
            assert.strictEqual(config.data, data, 'the original config owns the data factory')
        } else {
            assert.strictEqual(config.data, seed, 'ordinary pages keep their data object')
        }
        assert.deepEqual(seed, { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } })
        assert.strictEqual(
            Reflect.get(nativeConfig, '__vpt_meta'),
            metadata,
            'onLoad and prerender share identity storage'
        )
        assert.equal(Object.getOwnPropertyDescriptor(nativeConfig, '__vpt_meta')?.enumerable, false)
        assert.equal(Object.hasOwn({ ...nativeConfig }, '__vpt_meta'), false)
        assert.strictEqual(metadata.prerenderIdentity, initialPage, 'configuration must not consume prepared identity')
        assert.strictEqual(Reflect.get(nativeConfig, 'onLoad'), config.onLoad)
        Reflect.get(nativeConfig, 'onLoad').call(page, query)
        assert.strictEqual(Reflect.get(nativeConfig, 'onShareAppMessage')(), share)
        Reflect.get(nativeConfig, 'eh')('tap')
        assert.deepEqual(calls.slice(2), [
            { name: 'onLoad', args: [query] },
            { name: 'event', args: ['tap'] }
        ])
    }
})

test('Page data factories share native query capture installed during App activation', async () => {
    // Record listener installation, native registration and data creation without running business lifecycles.
    const calls: Call[] = []
    const factories: (() => unknown)[] = []
    const listeners: ((event: { query: Record<string, unknown> }) => void)[] = []
    const config = {
        data: {},
        onLoad: recordCall(calls, 'load', undefined)
    } satisfies PageInstance
    function prerenderToData(pageConfig: object, query: Record<string, unknown>) {
        assert.strictEqual(pageConfig, config)
        calls.push({ name: 'data', args: [query] })
        return { query }
    }
    const code = await bundleRuntimeEntry({
        entry: 'mini/native/page.ts',
        mocks: {
            '../amphibious/bootstrap.ts': '',
            './get-page-query.ts': `export { getPageQuery } from ${JSON.stringify(path.join(runtimeRoot, 'mini/taro/get-page-query.ts'))}`,
            '\0vpt:page-capsule': `export { default } from ${JSON.stringify(path.join(runtimeRoot, 'mini/capsule/page.ts'))}`,
            './app.ts': `
                import '../taro/taro-runtime.ts'
                globalThis.harness.assertListenerReady()
            `,
            '../taro/taro-runtime.ts': `export { createVptPage } from ${JSON.stringify(path.join(runtimeRoot, 'mini/taro/create-vpt-page.ts'))}`,
            'vite-plugin-taro-runtime/runtime/mini': 'export const createPageConfig = () => globalThis.harness.config',
            './prerender-to-data.ts': `
                import { getPageQuery } from './get-page-query.ts'
                export const prerenderToData = config => globalThis.harness.prerenderToData(config, getPageQuery())
            `,
            '\0vpt:page-component': 'export default () => null'
        },
        defines: {
            __VPT_PAGE_OPTIONS__: JSON.stringify({ path: 'pages/home/index', prerender: true })
        }
    })
    executeRuntimeEntry(code, {
        ...createExecutionContext({
            config,
            prerenderToData,
            assertListenerReady() {
                assert.equal(
                    listeners.length,
                    1,
                    'the shared Taro runtime installs query capture during App activation'
                )
            }
        }),
        wx: {
            onBeforePageLoad(listener: (event: { query: Record<string, unknown> }) => void) {
                listeners.push(listener)
            }
        },
        Page(definition) {
            assert.equal(listeners.length, 1, 'Page activation reuses the same Taro query listener')
            assert.ok(definition && typeof definition === 'object')
            assert.deepEqual(Object.keys(definition), ['data', 'onLoad'])
            assert.strictEqual(Reflect.get(definition, 'onLoad'), config.onLoad)
            assert.strictEqual(Reflect.get(definition, '__vpt_meta'), Reflect.get(config, '__vpt_meta'))
            factories.push(Reflect.get(definition, 'data'))
            calls.push({ name: 'register', args: [] })
        }
    })
    assert.deepEqual(calls, [{ name: 'register', args: [] }], 'registration must not render')
    assert.equal(factories.length, 1)
    const factory = factories[0]
    const beforePageLoad = listeners[0]
    assert.ok(factory)
    assert.ok(beforePageLoad)
    for (const query of [
        { id: 'first', full: 'a%3Db' },
        { id: 'second', full: '' }
    ]) {
        beforePageLoad({ query })
        assert.deepEqual(factory(), { query })
        assert.strictEqual(calls.at(-1)?.args[0], query, 'the query comes from native routing, not URL parsing')
    }
    assert.deepEqual(
        calls.map((call) => call.name),
        ['register', 'data', 'data']
    )
})

for (const prerender of [false, true]) {
    test(`WX hot registration preserves the native Page with prerender=${prerender}`, async (t) => {
        // Glass-easel re-executes registration without re-evaluating the cached capsule or creating another instance.
        const registrations: object[] = []
        const calls: Call[] = []
        const originalConfig = {
            data: { count: 0 },
            onLoad: recordCall(calls, 'load', undefined),
            onShow: recordCall(calls, 'show', undefined),
            onUnload: recordCall(calls, 'unload', undefined)
        }
        const createPageConfig = t.mock.fn((...args: unknown[]) => {
            Reflect.set(originalConfig, 'data', args[2])
            return originalConfig
        })
        const prerenderToData = t.mock.fn(
            (_config: unknown, _component: unknown, _route: string, data: unknown) => data
        )
        const capsuleCode = await bundleRuntimeEntry({
            entry: 'mini/capsule/page.ts',
            mocks: {
                './app.ts': '',
                '../taro/taro-runtime.ts': `export { createVptPage } from ${JSON.stringify(path.join(runtimeRoot, 'mini/taro/create-vpt-page.ts'))}`,
                'vite-plugin-taro-runtime/runtime/mini':
                    'export const createPageConfig = globalThis.harness.createPageConfig',
                './prerender-to-data.ts': 'export const prerenderToData = globalThis.harness.prerenderToData',
                '\0vpt:page-component': 'export default () => null'
            },
            defines: {
                __VPT_PAGE_OPTIONS__: JSON.stringify({ path: 'pages/home/index', config: {}, prerender })
            }
        })
        const config = executeRuntimeEntry(
            capsuleCode,
            createExecutionContext({ createPageConfig, prerenderToData })
        ).default
        assert.strictEqual(config, originalConfig)
        const initialData = createPageConfig.mock.calls[0]?.arguments[2]
        assert.ok(initialData && typeof initialData === 'object')
        const metadata = Object.freeze(Reflect.get(config, '__vpt_meta'))
        const initialNativeData = Reflect.get(config, 'data')
        const code = await bundleRuntimeEntry({
            entry: 'mini/native/page.ts',
            mocks: {
                '../amphibious/bootstrap.ts': '',
                '\0vpt:page-capsule': 'export default globalThis.harness.config'
            },
            defines: {},
            nativePageHmr: true
        })
        const harness = { config }
        const runtime = createDevtoolsHmrRuntime(() => assert.fail('Page registration must not open an HMR socket'))
        const context = {
            ...createExecutionContext(harness),
            globalThis: { harness, __rolldown_runtime__: runtime },
            Page(value: unknown) {
                assert.strictEqual(value, config, 'the shell must register the exact exported capsule config')
                registrations.push(config)
            }
        }
        const groupUpdates = () => assert.fail('Framework detection must not invoke the native method')
        const page = { data: { count: 7 }, groupUpdates }
        const firstQuery = { id: 'initial' }
        executeRuntimeEntry(code, context)
        Object.freeze(config)
        const first = registrations[0]
        assert.ok(first)
        assert.strictEqual(prerender ? Reflect.get(first, 'data')() : Reflect.get(first, 'data'), initialData)
        Reflect.get(first, 'onLoad').call(page, firstQuery)
        Reflect.get(first, 'onShow').call(page)

        executeRuntimeEntry(code, context)
        const second = registrations[1]
        assert.strictEqual(second, first, 'hot registration reuses the capsule export')
        assert.strictEqual(Reflect.get(config, 'data'), initialNativeData, 'HMR must preserve the data factory')
        assert.strictEqual(originalConfig.data, initialNativeData)
        assert.deepEqual(page.data, { count: 7 })
        assert.deepEqual(metadata, {})
        assert.equal(
            prerenderToData.mock.callCount(),
            prerender ? 1 : 0,
            'hot registration does not create an instance'
        )
        assert.deepEqual(calls, [
            { name: 'load', args: [firstQuery] },
            { name: 'show', args: [] }
        ])

        Reflect.get(first, 'onUnload').call(page)
        const nextPage = { data: { count: 0 }, groupUpdates }
        const reopenedData: unknown = Reflect.get(config, 'data')
        if (prerender) {
            assert.ok(typeof reopenedData === 'function')
            assert.strictEqual(reopenedData(), initialData)
        } else {
            assert.strictEqual(reopenedData, initialData)
        }
        assert.equal(
            prerenderToData.mock.callCount(),
            prerender ? 2 : 0,
            'real navigation initializes its own instance'
        )
        Reflect.get(config, 'onLoad').call(nextPage, { id: 'real-navigation' })
        Reflect.get(config, 'onShow').call(nextPage)
        assert.deepEqual(calls.slice(2), [
            { name: 'unload', args: [] },
            { name: 'load', args: [{ id: 'real-navigation' }] },
            { name: 'show', args: [] }
        ])
    })
}
