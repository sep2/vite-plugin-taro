import assert from 'node:assert/strict'
import test from 'node:test'
import { DevRuntime } from 'rolldown/experimental/runtime'

type TestPage = {
    $taroPath: string
    $taroParams: Record<string, unknown>
    data: Record<string, unknown>
    setData(data: Record<string, unknown>): void
}

type TestRoot = {
    ctx: unknown
}

type TestPageConfig = {
    onUnload(this: TestPage, ...args: unknown[]): void
    onLoad(this: TestPage, ...args: unknown[]): void
    onShow(this: TestPage, ...args: unknown[]): void
    onHide(this: TestPage, ...args: unknown[]): void
}

type TestRuntime = DevRuntime & {
    applyPatches(payload: { buildId: string; patches: [] }, route?: string): void
    connectTaro(
        current: { page: TestPage | null },
        document: { getElementById(path: string): TestRoot | undefined },
        injectPageInstance: (instance: unknown, path: string) => void
    ): void
    initialize(info: { buildId: string; endpoint: string }): void
    injectPageHmr(config: object, route: string): void
}

type TestHarness = Readonly<{
    bindings: Array<{ instance: TestPage; path: string }>
    createConfig(route: string, originals?: Partial<TestPageConfig>): TestPageConfig
    createPage(path: string): { instance: TestPage; root: TestRoot }
    runtime: TestRuntime
    startReplacement(route: string): void
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

    const roots = new Map<string, TestRoot>()
    const bindings: Array<{ instance: TestPage; path: string }> = []
    // Mutable source of truth matching Taro's existing Current.page lifecycle behavior.
    const current: { page: TestPage | null } = { page: null }

    runtime.connectTaro(current, { getElementById: (path) => roots.get(path) }, (instance, path) => {
        if (!isTestPage(instance)) throw new Error('Expected a native Page')
        bindings.push({ instance, path })
    })
    runtime.initialize({ buildId: 'build', endpoint: 'http://localhost/hmr' })

    return {
        bindings,
        runtime,
        createPage(path) {
            const root: TestRoot = { ctx: undefined }
            roots.set(path, root)

            return {
                instance: {
                    $taroPath: path,
                    $taroParams: {},
                    data: {},
                    setData(data): void {
                        this.data = data
                    }
                },
                root
            }
        },
        createConfig(route, originals) {
            const config = {
                onUnload: originals?.onUnload ?? (() => {}),
                onLoad: originals?.onLoad ?? (() => {}),
                onShow:
                    originals?.onShow ??
                    function (this: TestPage): void {
                        current.page = this
                    },
                onHide:
                    originals?.onHide ??
                    function (this: TestPage): void {
                        if (current.page === this) current.page = null
                    }
            }
            runtime.injectPageHmr(config, route)
            return config
        },
        startReplacement(route): void {
            runtime.applyPatches({ buildId: 'build', patches: [] }, route)
        }
    }
}

function isTestPage(value: unknown): value is TestPage {
    return typeof value === 'object' && value !== null && '$taroPath' in value && 'setData' in value
}

test('scopes replacement lifecycles to their Page route', async () => {
    const harness = await createTestHarness()
    const primary = harness.createPage('primary?stamp=old')
    const mirror = harness.createPage('mirror?stamp=old')
    const unloads: string[] = []
    const primaryConfig = harness.createConfig('primary', {
        onUnload() {
            unloads.push('primary')
        }
    })
    const mirrorConfig = harness.createConfig('mirror', {
        onUnload() {
            unloads.push('mirror')
        }
    })

    harness.startReplacement('mirror')
    primaryConfig.onUnload.call(primary.instance)
    mirrorConfig.onUnload.call(mirror.instance)

    assert.deepEqual(unloads, ['primary'])
})

test('consumes a replacement snapshot and suppresses synthetic business lifecycles', async () => {
    const harness = await createTestHarness()
    const page = harness.createPage('route?stamp=old')
    const lifecycleCalls: string[] = []
    const config = harness.createConfig('route', {
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
    page.instance.$taroParams = { id: '42' }
    page.instance.data = { root: { cn: ['preserved'] } }

    config.onShow.call(page.instance)
    harness.startReplacement('route')
    config.onUnload.call(page.instance)

    const paints: Record<string, unknown>[] = []
    const replacement: TestPage = {
        $taroPath: 'route?stamp=new',
        $taroParams: {},
        data: {},
        setData(data): void {
            paints.push(data)
        }
    }
    config.onLoad.call(replacement)
    config.onShow.call(replacement)

    assert.deepEqual(lifecycleCalls, ['show'])
    assert.deepEqual(paints, [{ root: { cn: ['preserved'] } }])
    assert.equal(replacement.$taroPath, 'route?stamp=old')
    assert.deepEqual(replacement.$taroParams, { id: '42' })
    assert.equal(page.root.ctx, replacement)
    assert.deepEqual(
        harness.bindings.map(({ instance, path }) => ({ sameInstance: instance === replacement, path })),
        [{ sameInstance: true, path: 'route?stamp=old' }]
    )

    // The handoff is one-shot: a later load cannot retain or replay the large data snapshot.
    harness.startReplacement('route')
    config.onLoad.call(replacement)
    assert.equal(paints.length, 1)
    config.onShow.call(replacement)
})
