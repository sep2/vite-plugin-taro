import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import type { PageInstance } from 'vite-plugin-taro-runtime/runtime/mini'
import { createDevtoolsHmrRuntime } from '../mini/dev/modes/devtools/devtools-runtime.ts'
import type { createTemplatePage } from '../mini/template/create-template-page.ts'
import type { VptPageOptions } from '../mini/vpt/vpt-page-options.d.ts'
import {
    bundleRuntimeEntry as bundleEntry,
    type Call,
    createExecutionContext,
    executeRuntimeEntry,
    recordCall,
    runtimeRoot
} from './runtime-entry-test-utils.ts'

// Real-renderer tests cover commits; these tests isolate configuration and capsule composition.
function bundleRuntimeEntry(options: Parameters<typeof bundleEntry>[0]) {
    return bundleEntry({
        ...options,
        mocks: {
            '../vpt/mount-page.ts': `
                export function mountPage(component, options, identity, onCommit) {
                    this.$taroParams = identity.params
                    globalThis.harness.onMount?.(identity)
                    onCommit()
                }
            `,
            '../vpt/get-page-query.ts': 'export const getPageQuery = () => globalThis.harness.query',
            ...options.mocks
        }
    })
}

const templateHostMock = `
    import { createTemplatePage } from ${JSON.stringify(path.join(runtimeRoot, 'mini/template/create-template-page.ts'))}
    export default { createPage: createTemplatePage }
`

// Mock only the capsule's bridge; renderer tests exercise these calls against real React and Taro.
const prerenderRuntimeMock = `
    export const createPageConfig = globalThis.harness.createPageConfig
    export const Current = globalThis.harness.Current ?? { app: { mount() {} } }
    export const document = globalThis.harness.document
    export const hydrate = globalThis.harness.hydrate
    export const incrementId = () => {
        // Each test capsule owns a deterministic instance counter.
        let id = 0
        return () => ++id
    }
    export const getPath = (route, params) => route + '?' + Object.entries(params).map(([key, value]) => key + '=' + value).join('&')
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
        createPage: recordCall(calls, 'createPage', pageConfig)
    }
    const code = await bundleRuntimeEntry({
        entry: 'mini/capsule/page.ts',
        mocks: {
            '../vpt/vpt-runtime.ts': `
                const harness = globalThis.harness
                export const createVptApp = harness.createVptApp
            `,
            '\0vpt:renderer-host': 'export default { createPage: globalThis.harness.createPage }',
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
        ['createVptApp', 'createPage']
    )
    assert.deepEqual(Object.keys(exports), ['default'])
    assert.deepEqual(calls[0]?.args, [AppComponent, appConfigInput])
    assert.deepEqual(calls[1]?.args, [PageComponent, vptPageOptions])
    assert.strictEqual(calls[1]?.args[1], vptPageOptions)
})

test('createTemplatePage forwards optional Page config through the shared options type', async (t) => {
    const options: Parameters<typeof createTemplatePage>[1][] = [
        { path: 'pages/home/index', prerender: false },
        { path: 'pages/home/index', config: { navigationBarTitleText: 'Home' }, prerender: false }
    ] satisfies VptPageOptions[]
    const bundle = await bundleRuntimeEntry({
        entry: 'mini/template/create-template-page.ts',
        mocks: {
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            './prerender-to-data.ts': 'export const prerenderToData = () => { throw new Error("Unexpected prerender") }'
        },
        defines: {}
    })
    for (const pageOptions of options) {
        const createPageConfig = t.mock.fn((...args: unknown[]) => ({ data: args[2] }))
        const exports = executeRuntimeEntry(bundle, createExecutionContext({ createPageConfig }))
        const createPage = exports.createTemplatePage
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

test('creates routing-independent Page identities for identical queries and timestamps', async (t) => {
    const Current = Object.freeze({ router: Object.freeze({ path: '/pages/current' }) })
    const code = await bundleRuntimeEntry({
        entry: 'mini/vpt/create-page-identity.ts',
        mocks: { 'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock },
        defines: {}
    })
    const { createPageIdentity } = executeRuntimeEntry(code, createExecutionContext({ Current }))
    assert.ok(typeof createPageIdentity === 'function')
    t.mock.method(Date, 'now', () => 123)
    const query = Object.freeze({ full: 'a%3Db', empty: '', $vptPage: 'business' })
    const first = createPageIdentity('pages/example', query)
    const second = createPageIdentity('pages/example', query)
    assert.deepEqual(first, {
        path: 'pages/example?$vptPage=1',
        params: { ...query, $taroTimestamp: 123 }
    })
    assert.equal(second.path, 'pages/example?$vptPage=2')
    assert.deepEqual(second.params, first.params)
    assert.notStrictEqual(first.params, second.params)
    assert.deepEqual(createPageIdentity('pages/example', undefined), {
        path: 'pages/example?$vptPage=3',
        params: { $taroTimestamp: 123 }
    })
})

test('prerender serializes the supplied Page identity', async () => {
    // Observe routing activation, React commitment and serialization in order.
    const calls: Call[] = []
    const component = () => null
    const identity = { path: 'pages/example?instance=1', params: { id: 'example' } }
    const seed = { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } }
    const app = { cn: [{ sid: 'app-child' }] }
    const page = { parentNode: { _root: app }, cn: [{ sid: 'page-child' }] }
    const code = await bundleRuntimeEntry({
        entry: 'mini/template/prerender-to-data.ts',
        mocks: {
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            'vite-plugin-taro-runtime/react': 'export const flushSync = globalThis.harness.flushSync'
        },
        defines: {}
    })
    for (const host of [null, { parentNode: null }, page]) {
        // Each host observation has its own mount/serialization journal.
        calls.length = 0
        const harness = {
            Current: {
                app: {
                    mount(value: unknown, path: string, getCtx: undefined, complete: () => void) {
                        const router = Reflect.get(harness.Current, 'router')
                        assert.deepEqual(router, {
                            path: '/pages/example',
                            $taroPath: identity.path,
                            params: identity.params,
                            onReady: 'pages/example.onReady',
                            onShow: 'pages/example.onShow',
                            onHide: 'pages/example.onHide'
                        })
                        assert.strictEqual(router.params, identity.params)
                        assert.equal(getCtx, undefined)
                        assert.equal(complete(), undefined)
                        calls.push({ name: 'mount', args: [value, path] })
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
        const { prerenderToData } = executeRuntimeEntry(code, createExecutionContext(harness))
        assert.ok(typeof prerenderToData === 'function')
        const data = prerenderToData(component, 'pages/example', identity, seed)
        assert.deepEqual(calls.slice(0, 4), [
            { name: 'flushSync', args: [] },
            { name: 'mount', args: [component, identity.path] },
            { name: 'commit', args: [] },
            { name: 'lookup', args: [identity.path] }
        ])
        if (host === page) {
            assert.deepEqual(calls.slice(4), [
                { name: 'hydrate', args: [app] },
                { name: 'hydrate', args: [page] }
            ])
            assert.deepEqual(data, {
                app: { nn: 'vpt_fragment', cn: app.cn },
                page: { cn: page.cn }
            })
        } else {
            assert.strictEqual(data, seed)
            assert.equal(calls.length, 4)
        }
        assert.deepEqual(seed, { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } })
    }
})

test('template data preserves its seed and routing until the App provides mount', async (t) => {
    const code = await bundleRuntimeEntry({
        entry: 'mini/template/create-template-page.ts',
        mocks: {
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            './prerender-to-data.ts': 'export const prerenderToData = globalThis.harness.unexpected',
            '../vpt/get-page-query.ts': 'export const getPageQuery = globalThis.harness.unexpected'
        },
        defines: {}
    })
    for (const app of [undefined, null, {}]) {
        const router = { path: '/existing' }
        const createPageConfig = t.mock.fn((...args: unknown[]) => ({ data: args[2] }))
        const harness = {
            createPageConfig,
            Current: { app, router },
            unexpected: () => assert.fail('An unavailable App must not capture query or render')
        }
        const { createTemplatePage } = executeRuntimeEntry(code, createExecutionContext(harness))
        assert.ok(typeof createTemplatePage === 'function')
        const config = createTemplatePage(() => null, { path: 'pages/cold', prerender: true })
        assert.strictEqual(config.data(), createPageConfig.mock.calls[0]?.arguments[2])
        assert.strictEqual(harness.Current.router, router)
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
            '\0vpt:renderer-host': templateHostMock,
            './app.ts': '',
            './prerender-to-data.ts':
                'export const prerenderToData = () => { throw new Error("Unexpected prerender") }',
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
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
    assert.equal(Object.hasOwn(exports, 'prerenderToData'), false)
})

test('createTemplatePage selects native data form without copying the config', async (t) => {
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
            onLoad(this: unknown, options: unknown, mount?: (dispatch: () => void) => void) {
                assert.strictEqual(this, page)
                assert.strictEqual(options, query)
                calls.push({ name: 'onLoad', args: [options] })
                assert.ok(mount)
                mount(() => calls.push({ name: 'load', args: [] }))
            },
            onShareAppMessage: () => share,
            eh: recordCall(calls, 'event', undefined)
        } satisfies PageInstance
        const onMount = t.mock.fn((identity: { path: string; params: Record<string, unknown> }) => {
            calls.push({ name: 'mount', args: [] })
            return identity
        })
        const prerenderToData = t.mock.fn((component: unknown, route: string, identity: unknown, data: unknown) => {
            assert.strictEqual(component, calls[1]?.args[0], 'the closure retains the Page component')
            assert.equal(route, 'pages/home/index')
            assert.strictEqual(data, calls[1]?.args[2], 'the factory passes the captured seed, not config.data')
            assert.ok(identity)
            return renderedData
        })
        const code = await bundleRuntimeEntry({
            entry: 'mini/capsule/page.ts',
            mocks: {
                '\0vpt:renderer-host': templateHostMock,
                './app.ts': 'globalThis.harness.initialize()',
                'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
                './prerender-to-data.ts': 'export const prerenderToData = globalThis.harness.prerenderToData',
                '\0vpt:page-component': 'export default () => null'
            },
            defines: {
                __VPT_PAGE_OPTIONS__: JSON.stringify({ path: 'pages/home/index', config: {}, prerender })
            }
        })
        const harness = {
            prerenderToData,
            onMount,
            query,
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
        assert.strictEqual(Reflect.get(nativeConfig, 'onLoad'), config.onLoad)
        Reflect.get(nativeConfig, 'onLoad').call(page, query)
        const identity = onMount.mock.calls[0]?.arguments[0]
        assert.ok(identity)
        assert.equal(identity.path, 'pages/home/index?$vptPage=1')
        assert.deepEqual(identity.params, { ...query, $taroTimestamp: identity.params.$taroTimestamp })
        if (prerender) {
            assert.strictEqual(identity, prerenderToData.mock.calls[0]?.arguments[2])
        }
        assert.strictEqual(Reflect.get(nativeConfig, 'onShareAppMessage')(), share)
        Reflect.get(nativeConfig, 'eh')('tap')
        assert.deepEqual(calls.slice(2), [
            { name: 'onLoad', args: [query] },
            { name: 'mount', args: [] },
            { name: 'load', args: [] },
            { name: 'event', args: ['tap'] }
        ])
    }
})

test('template factories retain independent one-shot mount identities', async (t) => {
    const onMount = t.mock.fn((identity: { path: string; params: Record<string, unknown> }) => identity)
    const prerenderToData = t.mock.fn((_component: unknown, _route: string, _identity: unknown, data: unknown) => data)
    const bundle = await bundleRuntimeEntry({
        entry: 'mini/template/create-template-page.ts',
        mocks: {
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            './prerender-to-data.ts': 'export const prerenderToData = globalThis.harness.prerenderToData'
        },
        defines: {}
    })
    const { createTemplatePage } = executeRuntimeEntry(
        bundle,
        createExecutionContext({
            onMount,
            prerenderToData,
            createPageConfig: () => ({
                onLoad(_query: unknown, mount: (dispatch: () => void) => void) {
                    mount(() => {})
                }
            })
        })
    )
    assert.ok(typeof createTemplatePage === 'function')
    const first = Object.freeze(createTemplatePage(() => null, { path: 'pages/first', prerender: true }))
    const second = Object.freeze(createTemplatePage(() => null, { path: 'pages/second', prerender: true }))
    first.data()
    second.data()
    first.onLoad.call({}, {})
    second.onLoad.call({}, {})
    first.onLoad.call({}, { id: 'next' })
    assert.strictEqual(onMount.mock.calls[0]?.arguments[0], prerenderToData.mock.calls[0]?.arguments[2])
    assert.strictEqual(onMount.mock.calls[1]?.arguments[0], prerenderToData.mock.calls[1]?.arguments[2])
    assert.equal(onMount.mock.calls[2]?.arguments[0].path, 'pages/first?$vptPage=3')
    assert.equal(onMount.mock.calls[2]?.arguments[0].params.id, 'next')
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
    function prerenderToData(query: Record<string, unknown>) {
        calls.push({ name: 'data', args: [query] })
        return { query }
    }
    const code = await bundleRuntimeEntry({
        entry: 'mini/native/page.ts',
        mocks: {
            '\0vpt:renderer-host': templateHostMock,
            '../amphibious/bootstrap.ts': '',
            '../vpt/get-page-query.ts': `export { getPageQuery } from ${JSON.stringify(path.join(runtimeRoot, 'mini/vpt/get-page-query.ts'))}`,
            '\0vpt:page-capsule': `export { default } from ${JSON.stringify(path.join(runtimeRoot, 'mini/capsule/page.ts'))}`,
            './app.ts': `
                import '\\0vpt:renderer-host'
                globalThis.harness.assertListenerReady()
            `,
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            './prerender-to-data.ts': `
                export const prerenderToData = (_component, _route, identity) => globalThis.harness.prerenderToData(identity.params)
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
            createPageConfig: () => config,
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
        const data = factory()
        assert.ok(data && typeof data === 'object')
        const captured = Reflect.get(data, 'query')
        assert.deepEqual(captured, { ...query, $taroTimestamp: captured.$taroTimestamp })
        assert.notStrictEqual(captured, query, 'native queries are copied into instance parameters')
        assert.strictEqual(captured, calls.at(-1)?.args[0])
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
            onLoad(query: unknown, mount?: (dispatch: () => void) => void) {
                assert.ok(mount)
                mount(() => calls.push({ name: 'load', args: [query] }))
            },
            onShow: recordCall(calls, 'show', undefined),
            onUnload: recordCall(calls, 'unload', undefined)
        }
        const createPageConfig = t.mock.fn((...args: unknown[]) => {
            Reflect.set(originalConfig, 'data', args[2])
            return originalConfig
        })
        const prerenderToData = t.mock.fn(
            (_component: unknown, _route: string, _identity: unknown, data: unknown) => data
        )
        const capsuleCode = await bundleRuntimeEntry({
            entry: 'mini/capsule/page.ts',
            mocks: {
                '\0vpt:renderer-host': templateHostMock,
                './app.ts': '',
                'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
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
