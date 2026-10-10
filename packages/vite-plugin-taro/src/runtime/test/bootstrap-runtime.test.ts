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
