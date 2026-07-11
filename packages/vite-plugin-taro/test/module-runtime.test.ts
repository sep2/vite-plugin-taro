import assert from 'node:assert/strict'
import test from 'node:test'
import { WxModuleRuntime } from '../src/shim/module-runtime.ts'

type RuntimeFactory = (
    module: { exports: unknown },
    exports: Record<string, unknown>,
    require: (id: string) => unknown
) => void

function createSnapshot(label: string, version: number) {
    const sharedFactory: RuntimeFactory = (module) => {
        module.exports = { token: {} }
    }
    const pageFactory: RuntimeFactory = (module, _exports, require) => {
        module.exports = Object.assign(function Page() {}, { label, shared: require('./shared.js') })
    }
    return {
        version,
        factories: { '/page.js': pageFactory, '/shared.js': sharedFactory },
        appRoot: '/page.js',
        pageRoots: { 'pages/index/index': '/page.js' }
    }
}

test('applies a pending update before the first page loads', async () => {
    let prepared = 0
    const runtime = new WxModuleRuntime({
        preparePageRefresh: () => {
            prepared++
            return undefined
        },
        reloadActivePage: () => assert.fail('compatible factories must not reload'),
        reportError: (error) => assert.fail(String(error))
    })

    runtime.applySnapshot(createSnapshot('one', 0))
    runtime.applySnapshot(createSnapshot('two', 1))
    await new Promise((resolve) => setTimeout(resolve))

    const page = runtime.getPageComponent('pages/index/index') as { label: string }
    assert.equal(page.label, 'two')
    assert.equal(prepared, 1)
})

test('replaces the complete application module set on each update', async () => {
    const runtime = new WxModuleRuntime({
        preparePageRefresh: () => undefined,
        reloadActivePage: () => assert.fail('compatible factories must not reload'),
        reportError: (error) => assert.fail(String(error))
    })

    runtime.applySnapshot(createSnapshot('one', 0))
    const first = runtime.getPageComponent('pages/index/index') as { label: string; shared: object }

    runtime.applySnapshot(createSnapshot('two', 1))
    await new Promise((resolve) => setTimeout(resolve))
    const second = runtime.getPageComponent('pages/index/index') as { label: string; shared: object }

    assert.equal(second.label, 'two')
    assert.notStrictEqual(second.shared, first.shared)
})
