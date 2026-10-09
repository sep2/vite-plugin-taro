import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build, type OutputChunk, type Plugin } from 'rolldown'
import type { PageInstance } from 'vite-plugin-taro-runtime/runtime/mini'
import { injectDevPageComponent } from '../../node/plugins/mini/dev/inject-dev-page-component.ts'
import { injectPageShellHmr } from '../../node/plugins/mini/dev/modes/devtools/devtools-hmr-mode.ts'
import { createDevtoolsHmrRuntime } from '../mini/dev/modes/devtools/devtools-runtime.ts'

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

// Each generated bundle has different offsets; unique URLs prevent V8 from merging incompatible ranges.
let runtimeEntryId = 0

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
}): Promise<{ code: string; execute: (...args: unknown[]) => void }> {
    const input = path.join(runtimeRoot, entry)
    const outputFile = path.join(runtimeRoot, `test/runtime-entry-${runtimeEntryId++}.js`)
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
            const code = mockSourceById.get(id)
            if (code === undefined) {
                return
            }
            // Virtual mocks are test inputs, not original runtime sources.
            return { code, map: { version: 3, sources: [], names: [], mappings: '' } }
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
            file: outputFile,
            exports: 'named',
            format: 'cjs',
            // A native module wrapper preserves the same lexical host bindings while making maps available to V8 coverage.
            postBanner:
                'export default function(module, exports, require, globalThis, global, App, Page, Component, wx, __rolldown_runtime__) {',
            postFooter: '}',
            sourcemap: 'inline'
        },
        write: false
    })
    const chunks = result.output.filter((output): output is OutputChunk => output.type === 'chunk')
    assert.equal(chunks.length, 1)
    const chunk = chunks[0]
    if (!chunk) {
        throw new Error(`Runtime entry did not emit JavaScript: ${entry}`)
    }
    const url = pathToFileURL(outputFile).href
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            return specifier === url ? { url, shortCircuit: true } : nextResolve(specifier, context)
        },
        load(id, context, nextLoad) {
            return id === url ? { format: 'module', source: chunk.code, shortCircuit: true } : nextLoad(id, context)
        }
    })
    try {
        const { default: execute }: { default: (...args: unknown[]) => void } = await import(url)
        return { code: chunk.code, execute }
    } finally {
        hooks.deregister()
    }
}

function executeRuntimeEntry(
    { execute }: Awaited<ReturnType<typeof bundleRuntimeEntry>>,
    context: ExecutionContext
): Record<string, unknown> {
    const commonJsModule: { exports: Record<string, unknown> } = { exports: {} }
    const rejectRequire = (id: string): never => assert.fail(`Unexpected external runtime import: ${id}`)

    execute(
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

/** Import-only facades disappear during bundling; execute their original modules to verify re-exports and side effects. */
async function importRuntimeFacade({
    entry,
    mocks,
    harness
}: {
    entry: string
    mocks: Readonly<Record<string, string>>
    harness: unknown
}): Promise<Record<string, unknown>> {
    const id = runtimeEntryId++
    const key = `vpt.runtime-facade-test:${id}`
    const mockUrls = new Map(
        Object.entries(mocks).map(([request, source]) => [
            request,
            `data:text/javascript,${encodeURIComponent(source.replaceAll('globalThis.harness', `globalThis[Symbol.for(${JSON.stringify(key)})]`))}`
        ])
    )
    // Native module mocks share this test-local harness only for the duration of their import.
    Reflect.set(globalThis, Symbol.for(key), harness)
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            const url = mockUrls.get(specifier)
            return url ? { url, shortCircuit: true } : nextResolve(specifier, context)
        }
    })
    try {
        return await import(`${pathToFileURL(path.join(runtimeRoot, entry)).href}?facade-test=${id}`)
    } finally {
        hooks.deregister()
        Reflect.deleteProperty(globalThis, Symbol.for(key))
    }
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
    const exports = await importRuntimeFacade({
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
        harness
    })

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

test('creates the Mini Program Page capsule after App initialization with one options object', async () => {
    // This mutable journal captures App-before-Page initialization and the two-argument factory contract.
    const calls: Call[] = []
    const appConfigInput = { pages: ['pages/home/index'] }
    const vptPageOptions = { path: 'pages/home/index', config: { navigationBarTitleText: 'Home' } }
    const appConfig = { kind: 'app-config' }
    const pageConfig = { kind: 'page-config' }
    const AppComponent = { kind: 'AppComponent' }
    const PageComponent = { kind: 'PageComponent' }
    const React = { kind: 'React' }
    const ReactDOM = { kind: 'ReactDOM' }
    const harness = {
        appConfigInput,
        vptPageOptions,
        AppComponent,
        PageComponent,
        React,
        ReactDOM,
        createReactApp: recordCall(calls, 'createReactApp', appConfig),
        createVptPageConfig: recordCall(calls, 'createVptPageConfig', pageConfig)
    }
    const code = await bundleRuntimeEntry({
        entry: 'mini/capsule/page.ts',
        mocks: {
            './taro-runtime.ts': `
                const harness = globalThis.harness
                export const ReactDOM = harness.ReactDOM
                export const createReactApp = harness.createReactApp
                export const createVptPageConfig = harness.createVptPageConfig
            `,
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            './prerender-to-data.ts':
                'export const prerenderToData = () => { throw new Error("Unexpected prerender") }',
            react: 'export const createElement = () => undefined; export default globalThis.harness.React',
            '\0vpt:app-component': 'export default globalThis.harness.AppComponent',
            '\0vpt:global-binding': 'export const vptGlobal = globalThis',
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
        ['createReactApp', 'createVptPageConfig']
    )
    assert.deepEqual(Object.keys(exports), ['default'])
    assert.deepEqual(calls[1]?.args, [PageComponent, vptPageOptions])
    assert.strictEqual(calls[1]?.args[1], vptPageOptions)
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
                export { createVptPageConfig } from ${JSON.stringify(path.join(runtimeRoot, 'mini/capsule/create-vpt-page-config.ts'))}
                export { prerenderToData } from ${JSON.stringify(path.join(runtimeRoot, 'mini/capsule/prerender-to-data.ts'))}
            `,
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            'vite-plugin-taro-runtime/react': 'export const flushSync = globalThis.harness.flushSync',
            '../amphibious/bootstrap.ts': 'export const getPageQuery = () => ({ id: "example" })'
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
        const { createVptPageConfig, prerenderToData } = executeRuntimeEntry(code, createExecutionContext(harness))
        assert.ok(typeof createVptPageConfig === 'function')
        assert.ok(typeof prerenderToData === 'function')
        const config = createVptPageConfig(component, { path: 'pages/example' })
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
        entry: 'mini/capsule/prerender-to-data.ts',
        mocks: {
            'vite-plugin-taro-runtime/runtime/mini': prerenderRuntimeMock,
            'vite-plugin-taro-runtime/react': 'export const flushSync = globalThis.harness.unexpected',
            '../amphibious/bootstrap.ts': 'export const getPageQuery = globalThis.harness.unexpected'
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
            './taro-runtime.ts': `export { createVptPageConfig } from ${JSON.stringify(path.join(runtimeRoot, 'mini/capsule/create-vpt-page-config.ts'))}`,
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

test('preserves WX capsule runtime initialization order and export identities', async () => {
    // This mutable trace verifies the WeChat platform runtime executes before React and Taro runtime facades are exposed.
    const events: string[] = []
    const createReactApp = () => undefined
    const createVptPageConfig = () => undefined
    const ReactDOM = {}
    const createRecursiveComponentConfig = () => undefined
    const customWrapperCache = new Map()
    const harness = {
        events,
        createReactApp,
        createVptPageConfig,
        ReactDOM,
        createRecursiveComponentConfig,
        customWrapperCache
    }
    const code = await bundleRuntimeEntry({
        entry: 'mini/capsule/taro-runtime.ts',
        mocks: {
            './create-vpt-page-config.ts': 'export const createVptPageConfig = globalThis.harness.createVptPageConfig',
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
            'vite-plugin-taro-runtime/runtime/mini': `
                globalThis.harness.events.push('taro-runtime')
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
    assert.strictEqual(exports.createVptPageConfig, createVptPageConfig)
    assert.strictEqual(exports.createRecursiveComponentConfig, createRecursiveComponentConfig)
})

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

test('createVptPageConfig selects native data form without copying the config', async (t) => {
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
                './taro-runtime.ts': `export { createVptPageConfig } from ${JSON.stringify(path.join(runtimeRoot, 'mini/capsule/create-vpt-page-config.ts'))}`,
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

test('Page data factories receive native queries captured before capsule initialization', async () => {
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
            '../amphibious/bootstrap.ts': `export { getPageQuery } from ${JSON.stringify(path.join(runtimeRoot, 'mini/amphibious/get-page-query.ts'))}`,
            '\0vpt:page-capsule': `export { default } from ${JSON.stringify(path.join(runtimeRoot, 'mini/capsule/page.ts'))}`,
            './app.ts': 'globalThis.harness.assertListenerReady()',
            './taro-runtime.ts': `export { createVptPageConfig } from ${JSON.stringify(path.join(runtimeRoot, 'mini/capsule/create-vpt-page-config.ts'))}`,
            'vite-plugin-taro-runtime/runtime/mini': 'export const createPageConfig = () => globalThis.harness.config',
            './prerender-to-data.ts': `
                import { getPageQuery } from '../amphibious/bootstrap.ts'
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
                assert.equal(listeners.length, 1, 'native query capture must be installed before the capsule')
            }
        }),
        wx: {
            onBeforePageLoad(listener: (event: { query: Record<string, unknown> }) => void) {
                listeners.push(listener)
            }
        },
        Page(definition) {
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

test('native query capture does nothing when the host does not provide its API', async () => {
    const code = await bundleRuntimeEntry({
        entry: 'mini/amphibious/get-page-query.ts',
        mocks: {},
        defines: {}
    })
    for (const host of [{}, { wx: {} }]) {
        const { getPageQuery } = executeRuntimeEntry(code, { ...createExecutionContext({}), ...host })
        assert.ok(typeof getPageQuery === 'function')
        assert.equal(getPageQuery(), undefined)
    }
})

test('disposes only its own native query listener when the module is hot-replaced', async () => {
    type Listener = (event: { query: Record<string, unknown> }) => void
    const unrelatedListener: Listener = () => {}
    // The host owns active listeners; the test invokes each generation's registered HMR disposal callback.
    const listeners = new Set<Listener>([unrelatedListener])
    const disposals: (() => void)[] = []
    const code = await bundleRuntimeEntry({
        entry: 'mini/amphibious/get-page-query.ts',
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
        const { getPageQuery } = executeRuntimeEntry(code, context)
        assert.ok(typeof getPageQuery === 'function')
        assert.equal(listeners.size, 2, 'each generation installs exactly one listener')
        const query = { id }
        for (const listener of listeners) {
            listener({ query })
        }
        assert.strictEqual(getPageQuery(), query)
        assert.equal(disposals.length, 1)
        const dispose = disposals.pop()
        assert.ok(dispose)
        dispose()
        assert.deepEqual([...listeners], [unrelatedListener])
    }
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
                './taro-runtime.ts': `export { createVptPageConfig } from ${JSON.stringify(path.join(runtimeRoot, 'mini/capsule/create-vpt-page-config.ts'))}`,
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

test('bootstrap loads polyfills, SystemJS and query capture and preserves preload semantics', async () => {
    // These mutable observations verify startup order, the shared native listener and one preload invocation.
    const events: string[] = []
    const preloadCalls: string[] = []
    const listeners: ((event: { query: Record<string, unknown> }) => void)[] = []
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
        wx: {
            onBeforePageLoad(listener: (event: { query: Record<string, unknown> }) => void) {
                events.push('query-capture')
                listeners.push(listener)
            }
        }
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

    assert.deepEqual(events, ['polyfills', 'create-system', 'query-capture'])
    assert.strictEqual(exports.System, loader)
    const getPageQuery = exports.getPageQuery
    assert.ok(typeof getPageQuery === 'function')
    assert.equal(listeners.length, 1)
    const listener = listeners[0]
    assert.ok(listener)
    const query = { id: 'native-query' }
    listener({ query })
    assert.strictEqual(getPageQuery(), query)
    assert.equal(Object.hasOwn(exports, 'Page'), false)
    assert.strictEqual(languageGlobal.System, loader)
    assert.strictEqual(loader.instantiate, transport)
    assert.equal(loaded, 'loaded')
    assert.deepEqual(preloadCalls, ['load'])
})

test('bootstrap initializes the loader and query capture before the native App capsule', async () => {
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
            assert.deepEqual(events, ['polyfills', 'query-capture'])
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
    assert.deepEqual(events, ['polyfills', 'query-capture', 'capsule', 'register'])
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
    const componentExports = await importRuntimeFacade({
        entry: 'client/taro/component.ts',
        mocks: {
            'vite-plugin-taro-runtime/components': 'export const View = globalThis.harness.View'
        },
        harness
    })

    const apiExports = executeRuntimeEntry(apiCode, createExecutionContext(harness))

    assert.deepEqual(events, ['backend', 'framework'])
    assert.strictEqual(apiExports.default, taro)
    assert.strictEqual(Reflect.get(taro, 'useLaunch'), useLaunch)
    assert.strictEqual(taro.options, options)
    assert.strictEqual(apiExports.showToast, showToast)
    assert.strictEqual(apiExports.useLaunch, useLaunch)
    assert.strictEqual(componentExports.View, View)
})
