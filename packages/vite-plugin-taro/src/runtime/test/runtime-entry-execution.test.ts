import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build, type OutputChunk, type Plugin } from 'rolldown'
import type { PageInstance } from 'vite-plugin-taro-runtime/runtime/mini'
import { injectDevPageComponent } from '../../node/plugins/mini/dev/inject-dev-page-component.ts'
import { injectPageShellHmr } from '../../node/plugins/mini/dev/modes/devtools/devtools-hmr-mode.ts'
import { injectPageHmr } from '../mini/dev/modes/devtools/inject-page-hmr.ts'

type Call = Readonly<{
    name: string
    args: readonly unknown[]
}>

type Registration = (config: unknown) => void

type ExecutionContext = Readonly<{
    globalThis: Record<string, unknown>
    global: Record<string, unknown>
    App: Registration
    Page: Registration
    Component: Registration
    wx?: object
}>

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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

function recordCall(calls: Call[], name: string, result: unknown): (...args: unknown[]) => unknown {
    return (...args) => {
        calls.push({ name, args })
        return result
    }
}

/** Records the native chain without evaluating its per-instance data callback at registration time. */
function createComponentBuilder(register: Registration) {
    // Each fluent call contributes one field to this registration-local definition.
    const definition: { options?: object; data?: () => unknown; methods?: object } = {}
    const builder = {
        options(options: object) {
            definition.options = options
            return builder
        },
        data(factory: () => unknown) {
            definition.data = factory
            return builder
        },
        methods(methods: object) {
            definition.methods = methods
            return builder
        },
        register() {
            register(definition)
        }
    }
    return builder
}

function rejectRegistration(name: string): Registration {
    return () => assert.fail(`Unexpected ${name} registration`)
}

async function bundleRuntimeEntry({
    entry,
    mocks,
    defines,
    servePageModuleId,
    nativePageHmr
}: {
    entry: string
    mocks: Readonly<Record<string, string>>
    defines: Readonly<Record<string, string>>
    servePageModuleId?: string
    nativePageHmr?: boolean
}): Promise<string> {
    const input = path.join(runtimeRoot, entry)
    const mockEntries = Object.entries(mocks).map(([request, source], index) => ({
        request,
        source,
        id: `\0vpt:runtime-entry-test:${index}`
    }))
    const mockIdByRequest = new Map(mockEntries.map(({ request, id }) => [request, id]))
    const mockSourceById = new Map(mockEntries.map(({ id, source }) => [id, source]))
    const mockPlugin: Plugin = {
        name: 'test:runtime-entry-mocks',
        resolveId(id) {
            return mockIdByRequest.get(id)
        },
        load(id) {
            return mockSourceById.get(id)
        },
        transform(code, id) {
            if (id === input && nativePageHmr) {
                return injectPageShellHmr(code)
            }
            if (id === input && servePageModuleId) {
                return injectDevPageComponent({ capsuleCode: code, componentId: servePageModuleId, capsuleId: id })
            }
        }
    }
    const result = await build({
        input,
        plugins: [mockPlugin],
        transform: {
            // Standalone CJS entries have no HMR unless a test supplies it or exercises a serve capsule.
            define: {
                'import.meta.hot': servePageModuleId ? 'globalThis.harness.hot' : 'undefined',
                ...defines
            }
        },
        output: {
            exports: 'named',
            format: 'cjs',
            sourcemap: false
        },
        write: false
    })
    const chunks = result.output.filter((output): output is OutputChunk => output.type === 'chunk')
    assert.equal(chunks.length, 1)
    const chunk = chunks[0]
    if (!chunk) {
        throw new Error(`Runtime entry did not emit JavaScript: ${entry}`)
    }
    return `${chunk.code}\n//# sourceURL=${pathToFileURL(path.join(runtimeRoot, entry)).href}?runtime-entry-test`
}

function executeRuntimeEntry(code: string, context: ExecutionContext): Record<string, unknown> {
    const commonJsModule: { exports: Record<string, unknown> } = { exports: {} }
    const rejectRequire = (id: string): never => assert.fail(`Unexpected external runtime import: ${id}`)

    Function(
        'module',
        'exports',
        'require',
        'globalThis',
        'global',
        'App',
        'Page',
        'Component',
        'wx',
        // Mini serve chunks receive this lexical binding from vpt:mini-global-dev at renderChunk.
        '__rolldown_runtime__',
        code
    )(
        commonJsModule,
        commonJsModule.exports,
        rejectRequire,
        context.globalThis,
        context.global,
        context.App,
        context.Page,
        context.Component,
        context.wx,
        context.globalThis.__rolldown_runtime__
    )

    return commonJsModule.exports
}

function createExecutionContext(harness: unknown): ExecutionContext {
    return {
        globalThis: { harness },
        global: {},
        App: rejectRegistration('App'),
        Page: rejectRegistration('Page'),
        Component: rejectRegistration('Component'),
        wx: { onBeforePageLoad() {} }
    }
}

test('boots the H5 App with one shared config and ordered router dependencies', async () => {
    // This mutable journal captures the startup protocol across the bundled H5 entry boundary.
    const calls: Call[] = []
    const config: { routes?: unknown } = {}
    const routes = [{ path: '/pages/home/index' }]
    const browserWindow: Record<string, unknown> = {}
    const app = { kind: 'app' }
    const history = { kind: 'history' }
    const AppComponent = { kind: 'AppComponent' }
    const React = { kind: 'React' }
    const ReactDOM = { kind: 'ReactDOM' }
    const harness = {
        config,
        routes,
        window: browserWindow,
        AppComponent,
        React,
        ReactDOM,
        createReactApp: recordCall(calls, 'createReactApp', app),
        createHashHistory: recordCall(calls, 'createHashHistory', history),
        handleAppMount: recordCall(calls, 'handleAppMount', undefined),
        createRouter: recordCall(calls, 'createRouter', undefined)
    }
    const code = await bundleRuntimeEntry({
        entry: 'h5/app.ts',
        mocks: {
            './taro-runtime.ts': `
                const harness = globalThis.harness
                export const window = harness.window
                export const createReactApp = harness.createReactApp
                export const createHashHistory = harness.createHashHistory
                export const handleAppMount = harness.handleAppMount
                export const createRouter = harness.createRouter
            `,
            react: 'export default globalThis.harness.React',
            'react-dom/client': 'export default globalThis.harness.ReactDOM',
            '\0vpt:app-component': 'export default globalThis.harness.AppComponent'
        },
        defines: {
            __VPT_H5_APP_CONFIG__: 'globalThis.harness.config',
            __VPT_H5_ROUTES__: 'globalThis.harness.routes'
        }
    })

    executeRuntimeEntry(code, createExecutionContext(harness))

    assert.strictEqual(browserWindow.__taroAppConfig, config)
    assert.strictEqual(config.routes, routes)
    assert.deepEqual(
        calls.map(({ name }) => name),
        ['createReactApp', 'createHashHistory', 'handleAppMount', 'createRouter']
    )
    assert.deepEqual(calls[0]?.args, [AppComponent, React, ReactDOM, config])
    assert.deepEqual(calls[1]?.args, [{ window: browserWindow }])
    assert.deepEqual(calls[2]?.args, [config, history])
    assert.deepEqual(calls[3]?.args, [history, app, config, React])
})

test('preserves H5 runtime facade side-effect order and export identities', async () => {
    // This mutable trace proves CSS initialization remains ahead of the framework and router facades.
    const events: string[] = []
    const createReactApp = () => undefined
    const createHashHistory = () => undefined
    const createRouter = () => undefined
    const handleAppMount = () => undefined
    const browserWindow = {}
    const harness = {
        events,
        createReactApp,
        createHashHistory,
        createRouter,
        handleAppMount,
        window: browserWindow
    }
    const code = await bundleRuntimeEntry({
        entry: 'h5/taro-runtime.ts',
        mocks: {
            'vite-plugin-taro-runtime/components/global.css': "globalThis.harness.events.push('global-css')",
            'vite-plugin-taro-runtime/components/dist/taro-components/taro-components.css':
                "globalThis.harness.events.push('component-css')",
            'vite-plugin-taro-runtime/plugin-framework-react/runtime': `
                globalThis.harness.events.push('framework')
                export const createReactApp = globalThis.harness.createReactApp
            `,
            'vite-plugin-taro-runtime/router': `
                globalThis.harness.events.push('router')
                export const createHashHistory = globalThis.harness.createHashHistory
                export const createRouter = globalThis.harness.createRouter
                export const handleAppMount = globalThis.harness.handleAppMount
            `,
            'vite-plugin-taro-runtime/runtime/h5': `
                globalThis.harness.events.push('runtime')
                export const window = globalThis.harness.window
            `
        },
        defines: {}
    })

    const exports = executeRuntimeEntry(code, createExecutionContext(harness))

    assert.deepEqual(events, ['global-css', 'component-css', 'framework', 'router', 'runtime'])
    assert.strictEqual(exports.createReactApp, createReactApp)
    assert.strictEqual(exports.createHashHistory, createHashHistory)
    assert.strictEqual(exports.createRouter, createRouter)
    assert.strictEqual(exports.handleAppMount, handleAppMount)
    assert.strictEqual(exports.window, browserWindow)
})

test('creates WX App and recursive component capsules only after App initialization', async () => {
    // This mutable journal verifies the recursive components cannot initialize ahead of the shared App capsule.
    const calls: Call[] = []
    const appConfigInput = { pages: ['pages/home/index'] }
    const appConfig = { kind: 'app-config' }
    const componentConfig = { kind: 'component-config' }
    const customWrapperConfig = { kind: 'custom-wrapper-config' }
    const AppComponent = { kind: 'AppComponent' }
    const React = { kind: 'React' }
    const ReactDOM = { kind: 'ReactDOM' }
    const harness = {
        appConfigInput,
        AppComponent,
        React,
        ReactDOM,
        createReactApp: recordCall(calls, 'createReactApp', appConfig),
        createRecursiveComponentConfig(name: string) {
            calls.push({ name: 'createRecursiveComponentConfig', args: [name] })
            return name === 'comp' ? componentConfig : customWrapperConfig
        }
    }
    const mocks = {
        './taro-runtime.ts': `
            const harness = globalThis.harness
            export const ReactDOM = harness.ReactDOM
            export const createReactApp = harness.createReactApp
            export const createRecursiveComponentConfig = harness.createRecursiveComponentConfig
        `,
        react: 'export default globalThis.harness.React',
        '\0vpt:app-component': 'export default globalThis.harness.AppComponent'
    }
    const defines = {
        __VPT_APP_CONFIG__: 'globalThis.harness.appConfigInput'
    }
    const appCode = await bundleRuntimeEntry({ entry: 'mini/capsule/app.ts', mocks, defines })
    const componentCode = await bundleRuntimeEntry({ entry: 'mini/capsule/component.ts', mocks, defines })

    const appExports = executeRuntimeEntry(appCode, createExecutionContext(harness))
    assert.deepEqual(
        calls.map(({ name }) => name),
        ['createReactApp']
    )
    assert.deepEqual(calls[0]?.args, [AppComponent, React, ReactDOM, appConfigInput])
    assert.strictEqual(appExports.default, appConfig)

    // Reset the mutable journal between independent entry executions so component ordering remains explicit.
    calls.length = 0
    const exports = executeRuntimeEntry(componentCode, createExecutionContext(harness))

    assert.deepEqual(
        calls.map(({ name }) => name),
        ['createReactApp', 'createRecursiveComponentConfig', 'createRecursiveComponentConfig']
    )
    assert.deepEqual(calls[0]?.args, [AppComponent, React, ReactDOM, appConfigInput])
    assert.deepEqual(calls[1]?.args, ['comp'])
    assert.deepEqual(calls[2]?.args, ['custom-wrapper'])
    assert.strictEqual(exports.componentConfig, componentConfig)
    assert.strictEqual(exports.customWrapperConfig, customWrapperConfig)
})

test('creates the Mini Program Page capsule with the transparent App collection seed', async () => {
    // This mutable journal captures App-before-Page initialization and the exact recursive projection seed.
    const calls: Call[] = []
    const appConfigInput = { pages: ['pages/home/index'] }
    const pageConfigInput = { navigationBarTitleText: 'Home' }
    const pagePath = 'pages/home/index'
    const appConfig = { kind: 'app-config' }
    const pageConfig = { kind: 'page-config' }
    const AppComponent = { kind: 'AppComponent' }
    const PageComponent = { kind: 'PageComponent' }
    const React = { kind: 'React' }
    const ReactDOM = { kind: 'ReactDOM' }
    const harness = {
        appConfigInput,
        pageConfigInput,
        pagePath,
        AppComponent,
        PageComponent,
        React,
        ReactDOM,
        createReactApp: recordCall(calls, 'createReactApp', appConfig),
        createPageConfig: recordCall(calls, 'createPageConfig', pageConfig)
    }
    const code = await bundleRuntimeEntry({
        entry: 'mini/capsule/page.ts',
        mocks: {
            './taro-runtime.ts': `
                const harness = globalThis.harness
                export const ReactDOM = harness.ReactDOM
                export const createReactApp = harness.createReactApp
                export const createPageConfig = harness.createPageConfig
            `,
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            react: 'export const createElement = () => undefined; export default globalThis.harness.React',
            '\0vpt:app-component': 'export default globalThis.harness.AppComponent',
            '\0vpt:global-binding': 'export const vptGlobal = globalThis',
            '\0vpt:page-component': 'export default globalThis.harness.PageComponent'
        },
        defines: {
            __VPT_APP_CONFIG__: 'globalThis.harness.appConfigInput',
            __VPT_PAGE_CONFIG__: 'globalThis.harness.pageConfigInput',
            __VPT_PAGE_PATH__: 'globalThis.harness.pagePath',
            __VPT_PAGE_PRERENDER__: 'false'
        }
    })

    const exports = executeRuntimeEntry(code, createExecutionContext(harness))

    assert.strictEqual(exports.default, pageConfig)
    assert.deepEqual(
        calls.map(({ name }) => name),
        ['createReactApp', 'createPageConfig']
    )
    assert.equal(calls[1]?.args.length, 5)
    assert.equal(calls[1]?.args[4], false)
    assert.deepEqual(Object.keys(exports), ['default'])
    assert.deepEqual(calls[1]?.args.slice(0, 4), [
        PageComponent,
        pagePath,
        { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } },
        pageConfigInput
    ])
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
                export { createPageConfig } from ${JSON.stringify(path.join(runtimeRoot, 'mini/capsule/create-page-config.ts'))}
                export { prerenderToData } from ${JSON.stringify(path.join(runtimeRoot, 'wx/native/prerender-to-data.ts'))}
            `,
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            'vite-plugin-taro-runtime/react': 'export const flushSync = globalThis.harness.flushSync',
            './get-wx-page-query.ts': 'export const getWxPageQuery = () => ({ id: "example" })'
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
        const { createPageConfig, prerenderToData } = executeRuntimeEntry(code, createExecutionContext(harness))
        assert.ok(typeof createPageConfig === 'function')
        assert.ok(typeof prerenderToData === 'function')
        const config = createPageConfig(
            component,
            'pages/example',
            { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } },
            {},
            true
        )
        assert.equal(Object.getOwnPropertyDescriptor(config, '__vpt_meta')?.enumerable, false)
        assert.equal(Object.hasOwn({ ...config }, '__vpt_meta'), false)
        assert.deepEqual(Object.keys(config), ['data'])
        assert.strictEqual(config.__vpt_meta.component, component)
        assert.equal(config.__vpt_meta.route, 'pages/example')
        assert.equal(config.__vpt_meta.prerender, true)
        assert.equal(config.__vpt_meta.skipPrerender, false)
        assert.equal(config.__vpt_meta.prerenderIdentity, undefined)
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
        const result = prerenderToData(config)
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
        prerenderToData(config)
        assert.equal(
            config.__vpt_meta.prerenderIdentity.path,
            'pages/example?instance=2',
            'identical queries use distinct instances'
        )
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
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            './taro-runtime.ts': `export { createPageConfig } from ${JSON.stringify(path.join(runtimeRoot, 'mini/capsule/create-page-config.ts'))}`,
            '\0vpt:global-binding': 'export const vptGlobal = globalThis',
            '\0vpt:page-component': 'export default globalThis.harness.PageComponent'
        },
        defines: {
            __VPT_PAGE_PATH__: "'pages/home/index'",
            __VPT_PAGE_CONFIG__: '{}',
            __VPT_PAGE_PRERENDER__: 'false'
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
    assert.strictEqual(Reflect.get(exports.default, '__vpt_meta').component, LatestPage)
    assert.equal(Reflect.get(exports.default, '__vpt_meta').prerender, false)
    assert.equal(Object.hasOwn(exports, 'prerenderToData'), false)
})

test('preserves WX capsule runtime initialization order and export identities', async () => {
    // This mutable trace verifies the WeChat platform runtime executes before React and Taro runtime facades are exposed.
    const events: string[] = []
    const createReactApp = () => undefined
    const ReactDOM = {}
    const createPageConfig = () => undefined
    const createRecursiveComponentConfig = () => undefined
    const customWrapperCache = new Map()
    const harness = {
        events,
        createReactApp,
        ReactDOM,
        createPageConfig,
        createRecursiveComponentConfig,
        customWrapperCache
    }
    const code = await bundleRuntimeEntry({
        entry: 'mini/capsule/taro-runtime.ts',
        mocks: {
            '\0vpt:taro-target-runtime': "globalThis.harness.events.push('target-runtime')",
            'vite-plugin-taro-runtime/plugin-html/runtime': "globalThis.harness.events.push('html-runtime')",
            'vite-plugin-taro-runtime/plugin-framework-react/runtime': `
                globalThis.harness.events.push('framework')
                export const createReactApp = globalThis.harness.createReactApp
            `,
            'vite-plugin-taro-runtime/react': `
                globalThis.harness.events.push('react-dom')
                export default globalThis.harness.ReactDOM
            `,
            './create-page-config.ts': 'export const createPageConfig = globalThis.harness.createPageConfig',
            'vite-plugin-taro-runtime/runtime/mini': `
                globalThis.harness.events.push('taro-runtime')
                export const createPageConfig = globalThis.harness.createPageConfig
                export const createRecursiveComponentConfig = globalThis.harness.createRecursiveComponentConfig
                export const customWrapperCache = globalThis.harness.customWrapperCache
            `
        },
        defines: {
            'process.env.NODE_ENV': JSON.stringify('development')
        }
    })
    const context = createExecutionContext(harness)
    const exports = executeRuntimeEntry(code, context)

    assert.deepEqual(events, ['target-runtime', 'html-runtime', 'framework', 'react-dom', 'taro-runtime'])
    assert.strictEqual(Reflect.get(context.globalThis, Symbol.for('customWrapperCache')), customWrapperCache)
    assert.strictEqual(exports.createReactApp, createReactApp)
    assert.strictEqual(exports.ReactDOM, ReactDOM)
    assert.strictEqual(exports.createPageConfig, createPageConfig)
    assert.strictEqual(exports.createRecursiveComponentConfig, createRecursiveComponentConfig)
})

test('registers native App and component shells after the VPT runtime', async () => {
    const appConfig = { kind: 'app-config' }
    const componentConfig = { kind: 'component-config' }
    const customWrapperConfig = { kind: 'custom-wrapper-config' }
    const entries = [
        {
            entry: 'mini/native/app.ts',
            mocks: {
                '../amphibious/vpt.ts': "globalThis.harness.events.push({ name: 'vpt', config: undefined })",
                '../capsule/app.ts': 'export default globalThis.harness.config'
            },
            registration: 'App',
            config: appConfig
        },
        {
            entry: 'mini/native/component.ts',
            mocks: {
                '../amphibious/vpt.ts': "globalThis.harness.events.push({ name: 'vpt', config: undefined })",
                '../capsule/component.ts': 'export const componentConfig = globalThis.harness.config'
            },
            registration: 'Component',
            config: componentConfig
        },
        {
            entry: 'mini/native/custom-wrapper.ts',
            mocks: {
                '../amphibious/vpt.ts': "globalThis.harness.events.push({ name: 'vpt', config: undefined })",
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
            ['vpt', entry.registration]
        )
        assert.strictEqual(events[1]?.config, entry.config)
    }
})

test('platform Page shells preserve onLoad timing and full queries', async () => {
    for (const [pageConstructor, prerender, registration] of [
        ['wx/native/wx-page-constructor.ts', false, 'Page'],
        ['wx/native/wx-page-constructor.ts', true, 'Component'],
        ['mini/native/mini-page-constructor.ts', false, 'Page'],
        ['mini/native/mini-page-constructor.ts', true, 'Page']
    ] as const) {
        // Each shell records dependency initialization, native registration and deferred lifecycles independently.
        const calls: Call[] = []
        const initialization = 'constructor'
        const page = { data: { count: 0 } }
        const query = { id: '42', undeclared: 'full-query', scene: 'a=b' }
        const share = { title: 'Shared page', path: '/pages/home/index?id=42' }
        const config = {
            data: page.data,
            options: { multipleSlots: true },
            ...(registration === 'Page' ? { events: { onBack: () => true } } : {}),
            onLoad(this: unknown, options: unknown) {
                assert.strictEqual(this, page)
                assert.strictEqual(options, query)
                calls.push({ name: 'onLoad', args: [options] })
            },
            onShareAppMessage: () => share,
            eh: recordCall(calls, 'event', undefined)
        } satisfies PageInstance
        Object.defineProperty(config, '__vpt_meta', {
            value: {
                component: () => null,
                route: 'pages/home/index',
                prerender,
                skipPrerender: false,
                prerenderIdentity: { path: 'pages/home/index?instance=1', params: query }
            }
        })
        Object.freeze(config)
        const code = await bundleRuntimeEntry({
            entry: 'mini/native/page.ts',
            mocks: {
                '../amphibious/vpt.ts': `
                    export { default as Page } from ${JSON.stringify(path.join(runtimeRoot, pageConstructor))}
                    globalThis.harness.initialize()
                `,
                './prerender-to-data.ts': 'export const prerenderToData = config => config.data',
                '\0vpt:page-capsule': 'export default globalThis.harness.config'
            },
            defines: {}
        })
        const harness = {
            config,
            initialize: recordCall(calls, initialization, undefined)
        }
        const context = {
            ...createExecutionContext(harness),
            Page: recordCall(calls, 'Page', undefined),
            Component: () => createComponentBuilder(recordCall(calls, 'Component', undefined))
        }
        executeRuntimeEntry(code, context)
        assert.deepEqual(
            calls.map(({ name }) => name),
            [initialization, registration]
        )
        assert.doesNotMatch(code, /process\.env|registerPage/)
        const registered = calls[1]?.args[0]
        assert.ok(registered && typeof registered === 'object')
        if (registration === 'Page') {
            assert.strictEqual(registered, config)
        } else {
            const { data, options, onLoad, onShareAppMessage, eh } = config
            assert.deepEqual(Reflect.get(registered, 'methods'), { onLoad, onShareAppMessage, eh })
            assert.strictEqual(Reflect.get(registered, 'data')(), data)
            assert.strictEqual(Reflect.get(registered, 'options'), options)
            assert.doesNotMatch(code, /\bPage\(/)
        }
        const methods = registration === 'Page' ? registered : Reflect.get(registered, 'methods')
        assert.strictEqual(methods.onLoad, config.onLoad)
        methods.onLoad.call(page, query)
        assert.strictEqual(methods.onShareAppMessage(), share)
        methods.eh('tap')
        assert.deepEqual(calls.slice(2), [
            { name: 'onLoad', args: [query] },
            { name: 'event', args: ['tap'] }
        ])
    }
})

test('glass-easel data factories receive native queries without replacing navigation or dispatching lifecycles', async () => {
    const calls: Call[] = []
    const factories: (() => unknown)[] = []
    const listeners: ((event: { query: Record<string, unknown> }) => void)[] = []
    const config = {
        data: {},
        onLoad: recordCall(calls, 'load', undefined)
    } satisfies PageInstance
    Object.defineProperty(config, '__vpt_meta', { value: { prerender: true, skipPrerender: false } })
    function prerenderToData(pageConfig: object, query: Record<string, unknown>) {
        assert.strictEqual(pageConfig, config)
        calls.push({ name: 'data', args: [query] })
        return { query }
    }
    const builder = {
        options(options: object) {
            assert.deepEqual(options, {})
            return builder
        },
        data(factory: () => unknown) {
            factories.push(factory)
            return builder
        },
        methods(methods: object) {
            assert.deepEqual(methods, { onLoad: config.onLoad })
            return builder
        },
        register() {
            calls.push({ name: 'register', args: [] })
        }
    }
    const code = await bundleRuntimeEntry({
        entry: 'mini/native/page.ts',
        mocks: {
            '../amphibious/vpt.ts': `export { default as Page } from ${JSON.stringify(path.join(runtimeRoot, 'wx/native/wx-page-constructor.ts'))}`,
            './prerender-to-data.ts': `
                import { getWxPageQuery } from ${JSON.stringify(path.join(runtimeRoot, 'wx/native/get-wx-page-query.ts'))}
                export const prerenderToData = config => globalThis.harness.prerenderToData(config, getWxPageQuery())
            `,
            '\0vpt:page-capsule': 'export default globalThis.harness.config'
        },
        defines: {}
    })
    executeRuntimeEntry(code, {
        ...createExecutionContext({ config, prerenderToData }),
        wx: {
            onBeforePageLoad(listener: (event: { query: Record<string, unknown> }) => void) {
                listeners.push(listener)
            }
        },
        Component(options) {
            assert.equal(options, undefined)
            return builder
        }
    })
    assert.deepEqual(calls, [{ name: 'register', args: [] }], 'registration must not render')
    assert.equal(factories.length, 1)
    assert.equal(listeners.length, 1)
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

test('disposes only its own native query listener when the module is hot-replaced', async () => {
    type Listener = (event: { query: Record<string, unknown> }) => void
    const unrelatedListener: Listener = () => {}
    // The host owns active listeners; the test invokes each generation's registered HMR disposal callback.
    const listeners = new Set<Listener>([unrelatedListener])
    const disposals: (() => void)[] = []
    const code = await bundleRuntimeEntry({
        entry: 'wx/native/get-wx-page-query.ts',
        mocks: {},
        defines: { 'import.meta.hot': 'globalThis.harness.hot' }
    })
    const context = {
        ...createExecutionContext({ hot: { dispose: (callback: () => void) => disposals.push(callback) } }),
        wx: {
            onBeforePageLoad(listener: Listener) {
                listeners.add(listener)
            },
            offBeforePageLoad(listener: Listener) {
                assert.notStrictEqual(listener, unrelatedListener)
                assert.equal(listeners.delete(listener), true, 'cleanup uses the registered callback reference')
            }
        }
    }
    for (const id of ['initial', 'replacement']) {
        const { getWxPageQuery } = executeRuntimeEntry(code, context)
        assert.ok(typeof getWxPageQuery === 'function')
        assert.equal(listeners.size, 2, 'each generation installs exactly one listener')
        const query = { id }
        for (const listener of listeners) {
            listener({ query })
        }
        assert.strictEqual(getWxPageQuery(), query)
        assert.equal(disposals.length, 1)
        const dispose = disposals.pop()
        assert.ok(dispose)
        dispose()
        assert.deepEqual([...listeners], [unrelatedListener])
    }
})

for (const prerender of [false, true]) {
    test(`hands off HMR data and lifecycles with Page prerender=${prerender}`, async (t) => {
        const cacheKey = Symbol.for('customWrapperCache')
        const previousCache = Object.getOwnPropertyDescriptor(globalThis, cacheKey)
        // The real HMR adapter consumes the App-owned cache; isolate this test's empty cache and restore it afterwards.
        Reflect.set(globalThis, cacheKey, new Map())
        t.after(() => {
            if (previousCache) {
                Object.defineProperty(globalThis, cacheKey, previousCache)
            } else {
                Reflect.deleteProperty(globalThis, cacheKey)
            }
        })
        // Native registrations and business lifecycles are journaled separately to detect accidental remounts.
        const registrations: object[] = []
        const calls: Call[] = []
        const config = {
            data: { count: 0 },
            onLoad: recordCall(calls, 'load', undefined),
            onShow: recordCall(calls, 'show', undefined),
            onUnload: recordCall(calls, 'unload', undefined)
        }
        // Page HMR controls native prerendering through this non-enumerable flag, separately from its private lifecycle gate.
        const metadata = { prerender, skipPrerender: false }
        Object.defineProperty(config, '__vpt_meta', { value: metadata })
        const initialData = config.data
        const code = await bundleRuntimeEntry({
            entry: 'mini/native/page.ts',
            mocks: {
                '../amphibious/vpt.ts': `export { default as Page } from ${JSON.stringify(path.join(runtimeRoot, 'wx/native/wx-page-constructor.ts'))}`,
                './prerender-to-data.ts': 'export const prerenderToData = globalThis.harness.prerenderToData',
                '\0vpt:page-capsule': 'export default globalThis.harness.config'
            },
            defines: {},
            nativePageHmr: true
        })
        const prerenderToData = t.mock.fn(() => initialData)
        const harness = { config, prerenderToData }
        const context = {
            ...createExecutionContext(harness),
            globalThis: { harness, __rolldown_runtime__: { injectPageHmr } },
            Page(value: unknown) {
                assert.equal(prerender, false, 'only ordinary pages use native Page')
                assert.strictEqual(value, config)
                registrations.push(config)
            },
            Component() {
                assert.equal(prerender, true, 'only opted-in pages use the Component data factory')
                return createComponentBuilder((value) => {
                    assert.ok(value && typeof value === 'object')
                    registrations.push(value)
                })
            }
        }
        const page = { data: { count: 7 } }
        const firstQuery = { id: 'initial' }
        executeRuntimeEntry(code, context)
        const first = registrations[0]
        assert.ok(first)
        assert.equal(metadata.skipPrerender, false)
        assert.strictEqual(prerender ? Reflect.get(first, 'data')() : Reflect.get(first, 'data'), initialData)
        assert.equal(prerenderToData.mock.callCount(), prerender ? 1 : 0)
        const firstMethods = prerender ? Reflect.get(first, 'methods') : first
        assert.deepEqual(Object.getOwnPropertySymbols({ ...firstMethods }), [], 'HMR state is not enumerable')
        assert.equal(Object.hasOwn({ ...firstMethods }, '__vpt_meta'), false)
        firstMethods.onLoad.call(page, firstQuery)
        firstMethods.onShow.call(page)

        executeRuntimeEntry(code, context)
        const second = registrations[1]
        assert.ok(second)
        assert.equal(metadata.skipPrerender, true)
        assert.strictEqual(prerender ? Reflect.get(second, 'data')() : Reflect.get(second, 'data'), page.data)
        assert.equal(
            prerenderToData.mock.callCount(),
            prerender ? 1 : 0,
            'native HMR must not prerender another React Page'
        )
        const secondMethods = prerender ? Reflect.get(second, 'methods') : second
        assert.strictEqual(secondMethods.onLoad, firstMethods.onLoad)
        firstMethods.onUnload.call(page)
        secondMethods.onLoad.call(page, { id: 'synthetic' })
        secondMethods.onShow.call(page)
        assert.equal(metadata.skipPrerender, false, 'onShow clears the flag before the next real navigation')
        assert.deepEqual(calls, [
            { name: 'load', args: [firstQuery] },
            { name: 'show', args: [] }
        ])

        secondMethods.onUnload.call(page)
        assert.strictEqual(
            prerender ? Reflect.get(second, 'data')() : Reflect.get(second, 'data'),
            prerender ? initialData : config.data
        )
        assert.equal(prerenderToData.mock.callCount(), prerender ? 2 : 0, 'real navigation respects the Page opt-in')
        secondMethods.onLoad.call(page, { id: 'real-navigation' })
        secondMethods.onShow.call(page)
        assert.deepEqual(calls.slice(2), [
            { name: 'unload', args: [] },
            { name: 'load', args: [{ id: 'real-navigation' }] },
            { name: 'show', args: [] }
        ])
    })
}

test('loads polyfills before SystemJS, installs amphibious transport and preserves preload semantics', async () => {
    // These mutable observations verify polyfill/SystemJS startup order and one synchronous preload invocation.
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
        globalThis: languageGlobal
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
    assert.equal(Object.hasOwn(exports, 'getWxPageQuery'), false)
    assert.equal(Object.hasOwn(exports, 'Page'), false)
    assert.strictEqual(languageGlobal.System, loader)
    assert.strictEqual(loader.instantiate, transport)
    assert.equal(loaded, 'loaded')
    assert.deepEqual(preloadCalls, ['load'])
})

test('VPT initializes bootstrap before evaluating and exporting the selected Page constructor', async () => {
    // Constructor dependencies may synchronously import capsules, so record loader readiness at evaluation time.
    const events: string[] = []
    const loader = {}
    const Page = () => assert.fail('Exporting the constructor must not register a Page')
    const preload = () => undefined
    const harness = { events, loader, Page, preload }
    const code = await bundleRuntimeEntry({
        entry: 'mini/amphibious/vpt.ts',
        mocks: {
            './bootstrap.ts': `
                globalThis.System = globalThis.harness.loader
                globalThis.harness.events.push('system')
                export const System = globalThis.System
                export const __vitePreload = globalThis.harness.preload
            `,
            'vpt:mini-page-constructor': `
                if (globalThis.System !== globalThis.harness.loader) {
                    throw new Error('Constructor evaluated before the loader')
                }
                globalThis.harness.events.push('constructor')
                export default globalThis.harness.Page
            `
        },
        defines: {}
    })
    const exports = executeRuntimeEntry(code, createExecutionContext(harness))
    assert.deepEqual(events, ['system', 'constructor'])
    assert.strictEqual(exports.System, loader)
    assert.strictEqual(exports.__vitePreload, preload)
    assert.strictEqual(exports.Page, Page)
})

test('attaches Mini hooks to the original API object without invoking platform APIs', async () => {
    const showToast = () => assert.fail('The Mini facade must not invoke native APIs during initialization')
    const useLaunch = () => undefined
    const View = { kind: 'View' }
    // This local trace records initialization once per dependency without invoking any exported API.
    const events: string[] = []
    const options = {}
    // Only the isolated backend fixture is augmented with framework hooks during facade evaluation.
    const taro = { showToast, options }
    const harness = { taro, showToast, useLaunch, View, events, options }
    const apiCode = await bundleRuntimeEntry({
        entry: 'client/taro/api.ts',
        mocks: {
            'vite-plugin-taro-runtime/taro': `
                globalThis.harness.events.push('backend')
                export default globalThis.harness.taro
                export const options = globalThis.harness.options
                export const showToast = globalThis.harness.showToast
            `,
            './framework-apis.ts': `
                globalThis.harness.events.push('framework')
                export const useLaunch = globalThis.harness.useLaunch
            `
        },
        defines: {}
    })
    const componentCode = await bundleRuntimeEntry({
        entry: 'client/taro/component.ts',
        mocks: {
            'vite-plugin-taro-runtime/components': 'export const View = globalThis.harness.View'
        },
        defines: {}
    })

    const apiExports = executeRuntimeEntry(apiCode, createExecutionContext(harness))
    const componentExports = executeRuntimeEntry(componentCode, createExecutionContext(harness))

    assert.deepEqual(events, ['backend', 'framework'])
    assert.strictEqual(apiExports.default, taro)
    assert.strictEqual(Reflect.get(taro, 'useLaunch'), useLaunch)
    assert.strictEqual(taro.options, options)
    assert.strictEqual(apiExports.showToast, showToast)
    assert.strictEqual(apiExports.useLaunch, useLaunch)
    assert.strictEqual(componentExports.View, View)
})
