import assert from 'node:assert/strict'
import test from 'node:test'
import {
    bundleRuntimeEntry,
    createExecutionContext,
    type ExecutionContext,
    executeRuntimeEntry
} from './runtime-entry-test-utils.ts'

test('registers native App and component shells after bootstrap', async () => {
    const appConfig = { kind: 'app-config' }
    const componentConfig = { kind: 'component-config' }
    const customWrapperConfig = { kind: 'custom-wrapper-config' }
    const entries = [
        {
            entry: 'mini/native/app.ts',
            mocks: {
                '../amphibious/bootstrap.ts':
                    "globalThis.harness.events.push({ name: 'bootstrap', config: undefined })",
                '../capsule/app.ts': 'export default globalThis.harness.config'
            },
            registration: 'App',
            config: appConfig
        },
        {
            entry: 'mini/native/component.ts',
            mocks: {
                '../amphibious/bootstrap.ts':
                    "globalThis.harness.events.push({ name: 'bootstrap', config: undefined })",
                '../capsule/component.ts': 'export const componentConfig = globalThis.harness.config'
            },
            registration: 'Component',
            config: componentConfig
        },
        {
            entry: 'mini/native/custom-wrapper.ts',
            mocks: {
                '../amphibious/bootstrap.ts':
                    "globalThis.harness.events.push({ name: 'bootstrap', config: undefined })",
                '../capsule/component.ts': 'export const customWrapperConfig = globalThis.harness.config'
            },
            registration: 'Component',
            config: customWrapperConfig
        }
    ] as const

    for (const entry of entries) {
        // This per-entry mutable trace proves VPT executes before exactly one native registration.
        const events: Array<Readonly<{ name: string; config: unknown }>> = []
        const harness = { events, config: entry.config }
        const code = await bundleRuntimeEntry({ entry: entry.entry, mocks: entry.mocks, defines: {} })
        const context: ExecutionContext = {
            globalThis: { harness },
            global: {},
            App: (config) => events.push({ name: 'App', config }),
            Page: (config) => events.push({ name: 'Page', config }),
            Component: (config) => events.push({ name: 'Component', config })
        }

        executeRuntimeEntry(code, context)

        assert.deepEqual(
            events.map(({ name }) => name),
            ['bootstrap', entry.registration]
        )
        assert.strictEqual(events[1]?.config, entry.config)
    }
})

test('bootstrap loads polyfills and SystemJS and preserves preload semantics', async () => {
    // These mutable observations verify infrastructure startup order and one preload invocation.
    const events: string[] = []
    const preloadCalls: string[] = []
    const loader: { instantiate?: unknown } = {}
    const languageGlobal: Record<string, unknown> = {}
    const transport = (moduleId: string) => ({ moduleId })
    const harness = {
        events,
        transport,
        createSystem() {
            events.push('create-system')
            return loader
        }
    }
    // This isolated global must expose the side-effect mock before the bundled loader evaluates it.
    languageGlobal.harness = harness
    const code = await bundleRuntimeEntry({
        entry: 'mini/amphibious/bootstrap.ts',
        mocks: {
            '\0vpt:global-binding': 'export const vptGlobal = globalThis',
            '\0vpt:mini-polyfills': "globalThis.harness.events.push('polyfills')",
            '../systemjs/system-core.js': 'export const System = globalThis.harness.createSystem()',
            '\0vpt:mini-transport': 'export const transport = globalThis.harness.transport'
        },
        defines: {}
    })
    const context: ExecutionContext = {
        ...createExecutionContext(harness),
        globalThis: languageGlobal,
        wx: { onBeforePageLoad: () => events.push('query-capture') }
    }

    const exports = executeRuntimeEntry(code, context)
    const preload = exports.__vitePreload
    if (typeof preload !== 'function') {
        assert.fail('Expected __vitePreload to be callable')
    }
    const loaded = Reflect.apply(preload, undefined, [
        () => {
            preloadCalls.push('load')
            return 'loaded'
        }
    ])

    assert.deepEqual(events, ['polyfills', 'create-system'])
    assert.strictEqual(exports.System, loader)
    assert.deepEqual(Object.keys(exports).toSorted(), ['System', '__vitePreload'])
    assert.strictEqual(languageGlobal.System, loader)
    assert.strictEqual(loader.instantiate, transport)
    assert.equal(loaded, 'loaded')
    assert.deepEqual(preloadCalls, ['load'])
})

test('bootstrap initializes the loader before the native App capsule', async () => {
    // Record readiness at the capsule boundary instead of relying on a separate runtime facade.
    const events: string[] = []
    const loader: { instantiate?: unknown } = {}
    const languageGlobal: Record<string, unknown> = {}
    const appConfig = { kind: 'app-config' }
    const transport = () => undefined
    const harness = {
        events,
        loader,
        transport,
        initializeApp() {
            assert.deepEqual(events, ['polyfills'])
            assert.strictEqual(languageGlobal.System, loader)
            assert.strictEqual(loader.instantiate, transport)
            events.push('capsule')
            return appConfig
        }
    }
    languageGlobal.harness = harness
    const code = await bundleRuntimeEntry({
        entry: 'mini/native/app.ts',
        mocks: {
            '\0vpt:global-binding': 'export const vptGlobal = globalThis',
            '\0vpt:mini-polyfills': "globalThis.harness.events.push('polyfills')",
            '../systemjs/system-core.js': 'export const System = globalThis.harness.loader',
            '\0vpt:mini-transport': 'export const transport = globalThis.harness.transport',
            '../capsule/app.ts': 'export default globalThis.harness.initializeApp()'
        },
        defines: {}
    })
    executeRuntimeEntry(code, {
        ...createExecutionContext(harness),
        globalThis: languageGlobal,
        wx: { onBeforePageLoad: () => events.push('query-capture') },
        App(config) {
            assert.strictEqual(config, appConfig)
            events.push('register')
        }
    })
    assert.deepEqual(events, ['polyfills', 'capsule', 'register'])
})

test('WX host selects once and binds native roots through SDK creation templates', async (t) => {
    // This journal checks host initialization before the SDK invokes each Page's creation callback.
    const events: string[] = []
    const register = t.mock.fn((factory: (templates: Readonly<Record<string, unknown>>) => object) => {
        events.push('templates')
        return factory({ 'native/component': () => undefined })
    })
    const harness = {
        events,
        codeSpace: { batchAddCompiledTemplate: register },
        config: {
            pages: ['pages/home', 'pages/detail'],
            componentFramework: { allUsed: ['glass-easel'] },
            renderer: { allUsed: ['webview', 'skyline'] }
        },
        templateHost: {},
        ensure: assert.ok
    }
    const mocks = {
        '@tarojs/shared': 'export const ensure = globalThis.harness.ensure; export function noop() {}',
        '../mini/template/create-template-host.ts': `export function createTemplateHost() {
            globalThis.harness.events.push('template'); return globalThis.harness.templateHost
        }`,
        './create-dom-host.ts': `export function createDomHost(getRoot) {
            globalThis.harness.events.push('host'); return { getRoot }
        }`
    }
    const bundle = await bundleRuntimeEntry({
        entry: 'wx/renderer-host.ts',
        mocks,
        defines: {
            __wxConfig: 'globalThis.harness.config',
            __wxCodeSpace__: 'globalThis.harness.codeSpace'
        }
    })
    const host = executeRuntimeEntry(bundle, createExecutionContext(harness)).default
    assert.deepEqual(events, ['templates', 'host'])
    const templates = register.mock.calls[0]!.result!
    assert.deepEqual(Object.keys(templates), ['pages/home', 'pages/detail'])
    const pages = [{ route: 'pages/home' }, { route: 'pages/home' }, { route: 'pages/detail' }]
    for (const page of pages) {
        const getTemplate = Reflect.get(templates, page.route)
        assert.equal(typeof getTemplate, 'function')
        assert.equal(getTemplate('named'), undefined)
        const createTemplate = getTemplate('')
        const root = { getHostNode: () => ({ getMethodCaller: () => page }) }
        createTemplate({ shadowRoot: root }, false).C()
        assert.equal(Reflect.get(page, '__vptWxRoot'), undefined)
        createTemplate({ shadowRoot: root }, true).C()
        createTemplate({ shadowRoot: root }, false).C()
        assert.strictEqual(Reflect.get(page, '__vptWxRoot'), root)
        assert.equal(Object.getOwnPropertyDescriptor(page, '__vptWxRoot')?.writable, false)
    }
    assert.ok(host && typeof host === 'object')
    const getRoot = Reflect.get(host, 'getRoot')
    for (const page of pages) {
        assert.strictEqual(getRoot(page), Reflect.get(page, '__vptWxRoot'))
    }
    assert.throws(() => getRoot({}), /captured native Page root/)
    assert.deepEqual(events, ['templates', 'host'], 'a mounted host never switches on runtime errors')

    const fallbackConfigs = [
        undefined,
        { ...harness.config, componentFramework: { allUsed: ['exparser'] } },
        { ...harness.config, componentFramework: { allUsed: ['glass-easel', 'exparser'] } }
    ]
    for (const config of fallbackConfigs) {
        const fallback = { ...harness, config, events: [] }
        assert.strictEqual(executeRuntimeEntry(bundle, createExecutionContext(fallback)).default, harness.templateHost)
        assert.deepEqual(fallback.events, ['template'])
    }
    for (const codeSpace of [undefined, {}, 'unavailable']) {
        const fallback = { ...harness, codeSpace, events: [] }
        assert.strictEqual(executeRuntimeEntry(bundle, createExecutionContext(fallback)).default, harness.templateHost)
        assert.deepEqual(fallback.events, ['template'])
    }
    assert.equal(register.mock.callCount(), 1, 'unsupported modes never register native templates')
    const missingSdkDefines: readonly Readonly<Record<string, string>>[] = [
        {},
        { __wxCodeSpace__: 'globalThis.harness.codeSpace' }
    ]
    for (const defines of missingSdkDefines) {
        const entry = await bundleRuntimeEntry({ entry: 'wx/renderer-host.ts', mocks, defines })
        const absent = { ...harness, events: [] }
        assert.strictEqual(executeRuntimeEntry(entry, createExecutionContext(absent)).default, harness.templateHost)
        assert.deepEqual(absent.events, ['template'], 'undeclared SDK globals select the template host')
    }

    const occupied = { 'pages/detail': () => undefined }
    const registerOccupied = t.mock.fn((factory: (templates: Readonly<Record<string, unknown>>) => object) =>
        factory(occupied)
    )
    const fallback = { ...harness, codeSpace: { batchAddCompiledTemplate: registerOccupied }, events: [] }
    const selected = executeRuntimeEntry(bundle, createExecutionContext(fallback)).default
    assert.strictEqual(selected, harness.templateHost)
    assert.deepEqual(registerOccupied.mock.calls[0]!.result, {}, 'one occupied route prevents every DOM registration')
    assert.deepEqual(Object.keys(occupied), ['pages/detail'])
    fallback.codeSpace.batchAddCompiledTemplate = register
    assert.strictEqual(selected, harness.templateHost)
    assert.deepEqual(fallback.events, ['template'], 'capability changes retain the startup host')

    const supportedConfigs = [
        { pages: harness.config.pages },
        { ...harness.config, componentFramework: {} },
        { ...harness.config, renderer: undefined },
        { ...harness.config, renderer: {} },
        { ...harness.config, renderer: { allUsed: ['webview'] } },
        { ...harness.config, renderer: { allUsed: ['skyline'] } }
    ]
    for (const config of supportedConfigs) {
        events.length = 0
        const supported = executeRuntimeEntry(bundle, createExecutionContext({ ...harness, config })).default
        assert.ok(supported && typeof supported === 'object')
        assert.equal(typeof Reflect.get(supported, 'getRoot'), 'function')
        assert.deepEqual(
            events,
            ['templates', 'host'],
            'SDK template capability selects DOM across renderer inventories'
        )
    }

    const failure = new Error('SDK registration failed')
    assert.throws(
        () =>
            executeRuntimeEntry(
                bundle,
                createExecutionContext({
                    ...harness,
                    codeSpace: {
                        batchAddCompiledTemplate() {
                            throw failure
                        }
                    }
                })
            ),
        (error) => error === failure
    )
})
