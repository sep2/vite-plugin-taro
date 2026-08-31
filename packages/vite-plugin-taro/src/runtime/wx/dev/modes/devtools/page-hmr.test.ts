import assert from 'node:assert/strict'
import test from 'node:test'
import { customWrapperCache } from '@tarojs/runtime/dist/utils/index.js'
import { DevRuntime } from 'rolldown/experimental/runtime'

type TestPage = {
    data: Record<string, unknown>
}

type PageConfigInput = {
    data: Record<string, unknown>
    onUnload?: (this: TestPage, ...args: unknown[]) => void
    onLoad?: (this: TestPage, ...args: unknown[]) => void
    onShow?: (this: TestPage, ...args: unknown[]) => void
}

type TestPageConfig = PageConfigInput & {
    onUnload(this: TestPage, ...args: unknown[]): void
    onLoad(this: TestPage, ...args: unknown[]): void
    onShow(this: TestPage, ...args: unknown[]): void
}

type TestRuntime = DevRuntime & {
    injectPageHmr(config: PageConfigInput): TestPageConfig
}

type TestHarness = Readonly<{
    createBareConfig(): TestPageConfig
    createConfig(originals?: Partial<TestPageConfig>): TestPageConfig
    createPage(): TestPage
    reregisterPage(config: TestPageConfig): void
}>

const customWrapperCacheKey = Symbol.for('customWrapperCache')

// Mutable only to give each dynamic import a fresh App-global runtime singleton.
let runtimeId = 0

async function createTestHarness(): Promise<TestHarness> {
    customWrapperCache.clear()
    Reflect.set(global, customWrapperCacheKey, customWrapperCache)
    Object.assign(globalThis, {
        DevRuntime,
        wx: {
            request(options: { success: () => void }): void {
                options.success()
            }
        }
    })

    runtimeId++
    await import(`./devtools-runtime.ts?page-hmr-test=${runtimeId}`)

    const runtime = (globalThis as typeof globalThis & { __rolldown_runtime__?: TestRuntime }).__rolldown_runtime__
    if (!runtime) throw new Error('WX dev runtime was not installed')

    return {
        createPage() {
            return { data: {} }
        },
        createBareConfig() {
            return runtime.injectPageHmr({ data: { root: { cn: [] } } })
        },
        createConfig(originals) {
            const config = {
                data: { root: { cn: [] } },
                onUnload: originals?.onUnload ?? (() => {}),
                onLoad: originals?.onLoad ?? (() => {}),
                onShow: originals?.onShow ?? (() => {})
            }
            return runtime.injectPageHmr(config)
        },
        reregisterPage(config): void {
            runtime.injectPageHmr(config)
        }
    }
}

test('wraps Page configurations that omit every business lifecycle', async () => {
    const harness = await createTestHarness()
    const config = harness.createBareConfig()
    const page = harness.createPage()

    config.onLoad.call(page, { route: 'initial' })
    config.onShow.call(page)
    harness.reregisterPage(config)
    config.onUnload.call(page)
    config.onLoad.call(page)
    config.onShow.call(page)

    harness.reregisterPage(config)
    assert.strictEqual(config.data, page.data)
})

test('scopes re-registration lifecycles to their static Page configuration', async () => {
    const harness = await createTestHarness()
    const primary = harness.createPage()
    const mirror = harness.createPage()
    const unloads: string[] = []
    const primaryConfig = harness.createConfig({
        onUnload() {
            unloads.push('primary')
        }
    })
    const mirrorConfig = harness.createConfig({
        onUnload() {
            unloads.push('mirror')
        }
    })

    primaryConfig.onLoad.call(primary)
    mirrorConfig.onLoad.call(mirror)
    harness.reregisterPage(mirrorConfig)
    primaryConfig.onUnload.call(primary)
    mirrorConfig.onUnload.call(mirror)

    assert.deepEqual(unloads, ['primary'])
})

test('does not arm re-registration before mount or after an ordinary unload', async () => {
    const harness = await createTestHarness()
    // This mutable trace verifies that ordinary lifecycle forwarding preserves both receiver identity and arguments.
    const lifecycleCalls: Array<Readonly<{ kind: string; page: TestPage; args: unknown[] }>> = []
    const config = harness.createConfig({
        onUnload(...args) {
            lifecycleCalls.push({ kind: 'unload', page: this, args })
        },
        onLoad(...args) {
            lifecycleCalls.push({ kind: 'load', page: this, args })
        },
        onShow(...args) {
            lifecycleCalls.push({ kind: 'show', page: this, args })
        }
    })
    const initialData = config.data

    harness.reregisterPage(config)
    assert.strictEqual(config.data, initialData)

    const firstPage = harness.createPage()
    config.onLoad.call(firstPage, 'first-load')
    config.onShow.call(firstPage, 'first-show')
    config.onUnload.call(firstPage, 'first-unload')

    firstPage.data = { stale: true }
    harness.reregisterPage(config)
    assert.strictEqual(config.data, initialData)

    const nextPage = harness.createPage()
    config.onLoad.call(nextPage, 'next-load')
    config.onShow.call(nextPage, 'next-show')

    assert.deepEqual(lifecycleCalls, [
        { kind: 'load', page: firstPage, args: ['first-load'] },
        { kind: 'show', page: firstPage, args: ['first-show'] },
        { kind: 'unload', page: firstPage, args: ['first-unload'] },
        { kind: 'load', page: nextPage, args: ['next-load'] },
        { kind: 'show', page: nextPage, args: ['next-show'] }
    ])
})

test('requires the App-global CustomWrapper cache before mounted re-registration', async () => {
    const harness = await createTestHarness()
    const config = harness.createConfig()
    config.onLoad.call(harness.createPage())
    Reflect.deleteProperty(global, customWrapperCacheKey)

    assert.throws(() => harness.reregisterPage(config), /cache is not installed/)
})

test('materializes a loaded lazy tree instead of its stale Suspense fallback before Page registration', async () => {
    const harness = await createTestHarness()
    const config = harness.createConfig()
    const page = harness.createPage()
    const currentInner = {
        nn: 'custom-wrapper',
        sid: 'inner',
        cn: [{ nn: '5', sid: 'label', cn: [{ nn: '9', sid: 'text', v: 'current lazy tree' }] }]
    }
    const currentOuter = {
        nn: 'custom-wrapper',
        sid: 'outer',
        cn: [{ nn: 'custom-wrapper', sid: 'inner', cn: [{ v: 'stale inner placeholder' }] }]
    }
    customWrapperCache.set('outer', { data: { i: currentOuter } })
    customWrapperCache.set('inner', { data: { i: currentInner } })
    const staleOuter = {
        nn: 'custom-wrapper',
        sid: 'outer',
        cn: [{ v: 'Loading native component...' }]
    }
    const unmountedWrapper = { nn: 'custom-wrapper', sid: 'unmounted', cn: [null] }
    const invalidWrapper = { nn: 'custom-wrapper', sid: 7, cn: [] }
    const pageChildren = [staleOuter, unmountedWrapper, invalidWrapper, 'ordinary text']
    page.data = { root: { cn: pageChildren } }

    config.onLoad.call(page)
    harness.reregisterPage(config)

    assert.strictEqual(pageChildren[0], currentOuter)
    assert.strictEqual(currentOuter.cn[0], currentInner)
    assert.strictEqual(pageChildren[1], unmountedWrapper)
    assert.strictEqual(pageChildren[2], invalidWrapper)
    assert.strictEqual(config.data, page.data)
})

test('retains native data and suppresses re-registration business lifecycles', async () => {
    const harness = await createTestHarness()
    const page = harness.createPage()
    const lifecycleCalls: string[] = []
    const config = harness.createConfig({
        onUnload() {
            lifecycleCalls.push('unload')
        },
        onLoad() {
            lifecycleCalls.push('load')
        },
        onShow() {
            lifecycleCalls.push('show')
        }
    })
    page.data = { root: { cn: ['preserved'] } }

    config.onLoad.call(page)
    config.onShow.call(page)
    assert.deepEqual(lifecycleCalls, ['load', 'show'])
    // Clear the mutable lifecycle trace so re-registration can prove every triggered callback is suppressed.
    lifecycleCalls.length = 0

    harness.reregisterPage(config)
    config.onUnload.call(page)

    assert.strictEqual(config.data, page.data)
    const transientPage: TestPage = { data: config.data }
    config.onLoad.call(transientPage)
    config.onShow.call(transientPage)

    assert.deepEqual(lifecycleCalls, [])
    assert.deepEqual(transientPage.data, { root: { cn: ['preserved'] } })
    assert.strictEqual(config.data, transientPage.data)

    // The Page bound to `this` during re-registration is temporary; the next registration reads from the mounted Page.
    page.data = { root: { cn: ['next'] } }
    harness.reregisterPage(config)
    assert.strictEqual(config.data, page.data)
    config.onLoad.call(transientPage)
    config.onShow.call(transientPage)
})
