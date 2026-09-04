import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build, type OutputChunk, type Plugin } from 'rolldown'

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
}>

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
    defines
}: {
    entry: string
    mocks: Readonly<Record<string, string>>
    defines: Readonly<Record<string, string>>
}): Promise<string> {
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
        }
    }
    const result = await build({
        input: path.join(runtimeRoot, entry),
        plugins: [mockPlugin],
        transform: {
            define: { ...defines }
        },
        output: {
            exports: 'named',
            format: 'cjs',
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
        code
    )(
        commonJsModule,
        commonJsModule.exports,
        rejectRequire,
        context.globalThis,
        context.global,
        context.App,
        context.Page,
        context.Component
    )

    return commonJsModule.exports
}

function createExecutionContext(harness: unknown): ExecutionContext {
    return {
        globalThis: { harness },
        global: {},
        App: rejectRegistration('App'),
        Page: rejectRegistration('Page'),
        Component: rejectRegistration('Component')
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
            '@tarojs/components/global.css': "globalThis.harness.events.push('global-css')",
            '@tarojs/components/dist/taro-components/taro-components.css':
                "globalThis.harness.events.push('component-css')",
            '@tarojs/plugin-framework-react/dist/runtime': `
                globalThis.harness.events.push('framework')
                export const createReactApp = globalThis.harness.createReactApp
            `,
            '@tarojs/router': `
                globalThis.harness.events.push('router')
                export const createHashHistory = globalThis.harness.createHashHistory
                export const createRouter = globalThis.harness.createRouter
                export const handleAppMount = globalThis.harness.handleAppMount
            `,
            '@tarojs/runtime': `
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
            '../../mini/capsule/taro-runtime.ts': `
                export const createPageConfig = globalThis.harness.createPageConfig
            `,
            react: 'export default globalThis.harness.React',
            '\0vpt:app-component': 'export default globalThis.harness.AppComponent',
            '\0vpt:page-component': 'export default globalThis.harness.PageComponent'
        },
        defines: {
            __VPT_APP_CONFIG__: 'globalThis.harness.appConfigInput',
            __VPT_PAGE_CONFIG__: 'globalThis.harness.pageConfigInput',
            __VPT_PAGE_PATH__: 'globalThis.harness.pagePath'
        }
    })

    const exports = executeRuntimeEntry(code, createExecutionContext(harness))

    assert.deepEqual(
        calls.map(({ name }) => name),
        ['createReactApp', 'createPageConfig']
    )
    assert.deepEqual(calls[1]?.args, [
        PageComponent,
        pagePath,
        { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } },
        pageConfigInput
    ])
    assert.strictEqual(exports.default, pageConfig)
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
            '\0vpt:taro-platform-runtime': "globalThis.harness.events.push('platform-runtime')",
            '@tarojs/plugin-framework-react/dist/runtime': `
                globalThis.harness.events.push('framework')
                export const createReactApp = globalThis.harness.createReactApp
            `,
            '@tarojs/react': `
                globalThis.harness.events.push('react-dom')
                export default globalThis.harness.ReactDOM
            `,
            '@tarojs/runtime': `
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

    assert.deepEqual(events, ['platform-runtime', 'framework', 'react-dom', 'taro-runtime'])
    assert.strictEqual(Reflect.get(context.globalThis, Symbol.for('customWrapperCache')), customWrapperCache)
    assert.strictEqual(exports.createReactApp, createReactApp)
    assert.strictEqual(exports.ReactDOM, ReactDOM)
    assert.strictEqual(exports.createPageConfig, createPageConfig)
    assert.strictEqual(exports.createRecursiveComponentConfig, createRecursiveComponentConfig)
})

test('registers every native WX shell after its amphibious bootstrap', async () => {
    const appConfig = { kind: 'app-config' }
    const componentConfig = { kind: 'component-config' }
    const customWrapperConfig = { kind: 'custom-wrapper-config' }
    const pageConfig = { kind: 'page-config' }
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
        },
        {
            entry: 'mini/native/page.ts',
            mocks: {
                '../amphibious/bootstrap.ts':
                    "globalThis.harness.events.push({ name: 'bootstrap', config: undefined })",
                '\0vpt:page-capsule': 'export default globalThis.harness.config'
            },
            registration: 'Page',
            config: pageConfig
        }
    ] as const

    for (const entry of entries) {
        // This per-entry mutable trace proves bootstrap executes before exactly one native registration.
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

test('installs amphibious transport on SystemJS and preserves preload semantics', async () => {
    // These mutable observations verify SystemJS installation order and one synchronous preload invocation.
    const events: string[] = []
    const preloadCalls: string[] = []
    const loader: { instantiate?: unknown } = {}
    const languageGlobal: Record<string, unknown> = {}
    const transport = (moduleId: string) => ({ moduleId })
    const harness = {
        events,
        transport,
        installSystem() {
            events.push('install-system')
            languageGlobal.System = loader
        }
    }
    // This isolated global must expose the side-effect mock before the bundled bootstrap evaluates it.
    languageGlobal.harness = harness
    const defines = {
        __VPT_TRANSPORT__: 'globalThis.harness.transport'
    }
    const transportCode = await bundleRuntimeEntry({
        entry: 'mini/amphibious/transport.ts',
        mocks: {},
        defines
    })
    const code = await bundleRuntimeEntry({
        entry: 'mini/amphibious/bootstrap.ts',
        mocks: {
            '../systemjs/system-core.js': 'globalThis.harness.installSystem()'
        },
        defines
    })
    const context: ExecutionContext = {
        ...createExecutionContext(harness),
        globalThis: languageGlobal
    }

    const transportExports = executeRuntimeEntry(transportCode, createExecutionContext(harness))
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

    assert.deepEqual(events, ['install-system'])
    assert.strictEqual(transportExports.transport, transport)
    assert.strictEqual(loader.instantiate, transport)
    assert.equal(loaded, 'loaded')
    assert.deepEqual(preloadCalls, ['load'])

    assert.throws(
        () =>
            executeRuntimeEntry(
                code,
                createExecutionContext({
                    transport,
                    installSystem() {}
                })
            ),
        /SystemJS failed to initialize in the Mini Program runtime/
    )
})

test('preserves client Taro facade identities without invoking platform APIs', async () => {
    const taro = { platform: 'test' }
    const showToast = () => undefined
    const View = { kind: 'View' }
    const harness = { taro, showToast, View }
    const apiCode = await bundleRuntimeEntry({
        entry: 'client/taro/api.ts',
        mocks: {
            '@tarojs/taro': `
                export default globalThis.harness.taro
                export const showToast = globalThis.harness.showToast
            `
        },
        defines: {}
    })
    const componentCode = await bundleRuntimeEntry({
        entry: 'client/taro/component.ts',
        mocks: {
            '@tarojs/components': 'export const View = globalThis.harness.View'
        },
        defines: {}
    })

    const apiExports = executeRuntimeEntry(apiCode, createExecutionContext(harness))
    const componentExports = executeRuntimeEntry(componentCode, createExecutionContext(harness))

    assert.strictEqual(apiExports.default, taro)
    assert.strictEqual(apiExports.showToast, showToast)
    assert.strictEqual(componentExports.View, View)
})
