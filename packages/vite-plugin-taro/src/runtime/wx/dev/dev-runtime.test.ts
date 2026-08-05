import assert from 'node:assert/strict'
import test from 'node:test'
import { DevRuntime } from 'rolldown/experimental/runtime'

type TestHotContext = Readonly<{
    accept: (callback?: (moduleExports: unknown) => void) => void
}>

type TestRuntime = DevRuntime &
    Readonly<{
        createModuleHotContext: (moduleId: string) => TestHotContext
        initialize: (info: { buildId: string; endpoint: string }) => void
        storePatches: (payload: {
            buildId: string
            patches: Array<{
                version: number
                changedIds: string[]
                factory: () => void
            }>
        }) => void
    }>

/** Captures metadata reports so tests can assert that normal HMR never requests a rebuild. */
const reports: unknown[] = []
Object.assign(globalThis, {
    DevRuntime,
    wx: {
        request(options: { data: unknown; success: () => void }): void {
            reports.push(options.data)
            options.success()
        }
    }
})

await import('./dev-runtime.ts')

function getRuntime(): TestRuntime {
    const runtime = (globalThis as typeof globalThis & { __rolldown_runtime__?: TestRuntime }).__rolldown_runtime__
    if (!runtime) throw new Error('WX dev runtime was not installed')
    return runtime
}

const runtime = getRuntime()
runtime.initialize({ buildId: 'build', endpoint: 'http://localhost/hmr' })

function registerInitialModule(moduleId: string, moduleExports: unknown, callback?: (fresh: unknown) => void): void {
    runtime.registerGraph({ ids: [moduleId], localCount: 1, edges: [[]], dynamicEdges: [[]] })
    const hotContext = runtime.createModuleHotContext(moduleId)
    hotContext.accept(callback)
    runtime.registerModule(moduleId, { exports: moduleExports })
}

function createPatch(
    version: number,
    moduleId: string,
    moduleExports: unknown
): { version: number; changedIds: string[]; factory: () => void } {
    return {
        version,
        changedIds: [moduleId],
        factory(): void {
            runtime.registerGraph({ ids: [moduleId], localCount: 1, edges: [[]], dynamicEdges: [[]] })
            runtime.registerFactory(moduleId, 'esm', (id) => {
                runtime.registerModule(id, { exports: moduleExports })
                runtime.createModuleHotContext(id).accept()
            })
        }
    }
}

test('evicts an accepted module before running its new factory', () => {
    // Written by the old generation's accept callback; it must observe the new exports.
    let acceptedExports: unknown
    registerInitialModule('accepted', { value: 'old' }, (fresh) => {
        acceptedExports = fresh
    })

    runtime.storePatches({
        buildId: 'build',
        patches: [createPatch(1, 'accepted', { value: 'new' })]
    })

    assert.deepEqual(acceptedExports, { value: 'new' })
    assert.deepEqual(runtime.loadExports('accepted'), { value: 'new' })
})

test('treats a bare accept as a self-accepting boundary', () => {
    registerInitialModule('bare', { value: 'old' })

    runtime.storePatches({
        buildId: 'build',
        patches: [createPatch(2, 'bare', { value: 'new' })]
    })

    assert.deepEqual(runtime.loadExports('bare'), { value: 'new' })
    assert.equal(
        reports.some((report) => JSON.stringify(report).includes('rebuild')),
        false
    )
})
