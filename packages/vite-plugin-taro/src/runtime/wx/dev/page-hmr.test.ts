import assert from 'node:assert/strict'
import test from 'node:test'
import { DevRuntime } from 'rolldown/experimental/runtime'

type TestPage = {
    data: Record<string, unknown>
}

type TestPageConfig = {
    data: Record<string, unknown>
    onUnload(this: TestPage, ...args: unknown[]): void
    onLoad(this: TestPage, ...args: unknown[]): void
    onShow(this: TestPage, ...args: unknown[]): void
}

type TestRuntime = DevRuntime & {
    injectPageHmr(config: TestPageConfig): TestPageConfig
}

type TestHarness = Readonly<{
    createConfig(originals?: Partial<TestPageConfig>): TestPageConfig
    createPage(): TestPage
    reregisterPage(config: TestPageConfig): void
}>

// Mutable only to give each dynamic import a fresh App-global runtime singleton.
let runtimeId = 0

async function createTestHarness(): Promise<TestHarness> {
    Object.assign(globalThis, {
        DevRuntime,
        wx: {
            request(options: { success: () => void }): void {
                options.success()
            }
        }
    })

    runtimeId++
    await import(`./dev-runtime.ts?page-hmr-test=${runtimeId}`)

    const runtime = (globalThis as typeof globalThis & { __rolldown_runtime__?: TestRuntime }).__rolldown_runtime__
    if (!runtime) throw new Error('WX dev runtime was not installed')

    return {
        createPage() {
            return { data: {} }
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
