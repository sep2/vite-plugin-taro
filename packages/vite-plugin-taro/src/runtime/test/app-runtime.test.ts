import assert from 'node:assert/strict'
import test from 'node:test'
import {
    bundleRuntimeEntry,
    type Call,
    createExecutionContext,
    executeRuntimeEntry,
    recordCall
} from './runtime-entry-test-utils.ts'

test('creates WX App and recursive component capsules only after App initialization', async () => {
    // This mutable journal verifies the recursive components cannot initialize ahead of the shared App capsule.
    const calls: Call[] = []
    const appConfigInput = { pages: ['pages/home/index'] }
    const appConfig = { kind: 'app-config' }
    const componentConfig = { kind: 'component-config' }
    const customWrapperConfig = { kind: 'custom-wrapper-config' }
    const AppComponent = { kind: 'AppComponent' }
    const harness = {
        appConfigInput,
        AppComponent,
        createVptApp: recordCall(calls, 'createVptApp', appConfig),
        createRecursiveComponentConfig(name: string) {
            calls.push({ name: 'createRecursiveComponentConfig', args: [name] })
            return name === 'comp' ? componentConfig : customWrapperConfig
        }
    }
    const mocks = {
        '../taro/taro-runtime.ts': `
            const harness = globalThis.harness
            export const createVptApp = harness.createVptApp
            export const createRecursiveComponentConfig = harness.createRecursiveComponentConfig
        `,
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
        ['createVptApp']
    )
    assert.deepEqual(calls[0]?.args, [AppComponent, appConfigInput])
    assert.strictEqual(appExports.default, appConfig)

    // Reset the mutable journal between independent entry executions so component ordering remains explicit.
    calls.length = 0
    const exports = executeRuntimeEntry(componentCode, createExecutionContext(harness))

    assert.deepEqual(
        calls.map(({ name }) => name),
        ['createVptApp', 'createRecursiveComponentConfig', 'createRecursiveComponentConfig']
    )
    assert.deepEqual(calls[0]?.args, [AppComponent, appConfigInput])
    assert.deepEqual(calls[1]?.args, ['comp'])
    assert.deepEqual(calls[2]?.args, ['custom-wrapper'])
    assert.strictEqual(exports.componentConfig, componentConfig)
    assert.strictEqual(exports.customWrapperConfig, customWrapperConfig)
})

test('App presentation delegates mounting and seeds lazy snapshots before native initialization', async () => {
    const bundle = await bundleRuntimeEntry({
        entry: 'mini/taro/create-vpt-app.ts',
        mocks: {
            react: 'export default globalThis.harness.react',
            'vite-plugin-taro-runtime/react': 'export default globalThis.harness.renderer',
            'vite-plugin-taro-runtime/plugin-framework-react/runtime':
                'export const createReactApp = globalThis.harness.createReactApp',
            'vite-plugin-taro-runtime/runtime/mini': `
                export const document = globalThis.harness.document
                export const hydrate = globalThis.harness.hydrate
            `
        },
        defines: { getCurrentPages: 'globalThis.harness.getCurrentPages' }
    })
    for (const config of [{}, { appId: '' }, { appId: 'custom-app' }]) {
        // Each case owns one App, one delayed Taro commit, and a mutable native Page stack.
        const trace: string[] = []
        const payloads: { path: string; value: () => unknown }[] = []
        let commit: (() => void) | undefined
        const container: {
            ctx: { setData: (data: Record<string, unknown>, complete: () => void) => void } | null
            children: string[]
        } = { ctx: null, children: ['initial'] }
        const component = () => null
        const react = {}
        const renderer = {}
        const app = {
            mount(source: unknown, id: string, complete: () => void) {
                assert.strictEqual(this, app)
                assert.strictEqual(source, component)
                assert.equal(id, 'page-instance')
                trace.push('mount')
                commit = complete
            }
        }
        const pageRoot = {
            enqueueUpdate(payload: (typeof payloads)[number]) {
                trace.push('snapshot')
                payloads.push(payload)
            }
        }
        const data = { 'app.cn[0].cl': 'updated' }
        const native = (name: string) => ({
            setData(value: unknown, complete?: () => void) {
                assert.strictEqual(value, data)
                trace.push(name)
                if (name === 'hidden') {
                    assert.equal(complete, undefined)
                }
                complete?.()
            }
        })
        const pages: ReturnType<typeof native>[] = []
        const harness = {
            react,
            renderer,
            createReactApp(...args: unknown[]) {
                assert.deepEqual(args, [component, react, renderer, config])
                assert.strictEqual(args[1], react)
                assert.strictEqual(args[2], renderer)
                assert.strictEqual(args[3], config)
                return app
            },
            getCurrentPages: () => pages,
            document: {
                getElementById(id: string) {
                    if (id === 'page-instance') {
                        return pageRoot
                    }
                    assert.equal(id, config.appId || 'app')
                    return container
                }
            },
            hydrate(node: unknown) {
                assert.strictEqual(node, container)
                trace.push('hydrate')
                return { cn: container.children }
            }
        }
        const { createVptApp } = executeRuntimeEntry(bundle, createExecutionContext(harness))
        assert.equal(typeof createVptApp, 'function')
        if (typeof createVptApp !== 'function') {
            throw new Error('Expected the VPT App factory')
        }
        assert.strictEqual(createVptApp(component, config), app)
        assert.ok(container.ctx)
        container.ctx.setData(data, () => trace.push('complete-empty'))
        assert.deepEqual(trace, ['complete-empty'])
        trace.length = 0
        pages.push(native('hidden'), native('current'))
        container.ctx.setData(data, () => trace.push('complete-native'))
        assert.deepEqual(trace, ['hidden', 'current', 'complete-native'])
        trace.length = 0
        pages.splice(0, pages.length, native('current'))
        container.ctx.setData(data, () => trace.push('complete-current'))
        assert.deepEqual(trace, ['current', 'complete-current'], 'the native stack is read at flush time')
        trace.length = 0

        app.mount(component, 'page-instance', () => trace.push('native-init'))
        assert.deepEqual(trace, ['mount'], 'the adapter follows Taro commit timing')
        assert.ok(commit)
        commit()
        assert.deepEqual(trace, ['mount', 'snapshot', 'native-init'])
        assert.equal(payloads.length, 1)
        assert.equal(payloads[0].path, 'app.cn')
        container.children = ['latest']
        assert.strictEqual(payloads[0].value(), container.children)
        assert.deepEqual(trace, ['mount', 'snapshot', 'native-init', 'hydrate'])
    }
})

test('preserves Mini Taro initialization order and export identities', async () => {
    // This mutable trace verifies the WeChat platform runtime executes before React and Taro runtime facades are exposed.
    const events: string[] = []
    const createVptApp = () => undefined
    const createVptPage = () => undefined
    const createRecursiveComponentConfig = () => undefined
    const customWrapperCache = new Map()
    const harness = {
        events,
        createVptApp,
        createVptPage,
        createRecursiveComponentConfig,
        customWrapperCache
    }
    const code = await bundleRuntimeEntry({
        entry: 'mini/taro/taro-runtime.ts',
        mocks: {
            './create-vpt-page.ts': 'export const createVptPage = globalThis.harness.createVptPage',
            '\0vpt:taro-target-runtime': "globalThis.harness.events.push('target-runtime')",
            'vite-plugin-taro-runtime/plugin-html/runtime': "globalThis.harness.events.push('html-runtime')",
            './create-vpt-app.ts': `
                globalThis.harness.events.push('vpt-app')
                export const createVptApp = globalThis.harness.createVptApp
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

    assert.deepEqual(events, ['target-runtime', 'html-runtime', 'vpt-app', 'taro-runtime'])
    assert.strictEqual(Reflect.get(context.globalThis, Symbol.for('customWrapperCache')), customWrapperCache)
    assert.strictEqual(exports.createVptApp, createVptApp)

    assert.strictEqual(exports.createVptPage, createVptPage)
    assert.strictEqual(exports.createRecursiveComponentConfig, createRecursiveComponentConfig)
})
