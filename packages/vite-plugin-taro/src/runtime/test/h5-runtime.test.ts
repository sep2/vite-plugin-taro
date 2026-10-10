import assert from 'node:assert/strict'
import test from 'node:test'
import {
    bundleRuntimeEntry,
    type Call,
    createExecutionContext,
    executeRuntimeEntry,
    importRuntimeFacade,
    recordCall
} from './runtime-entry-test-utils.ts'

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
