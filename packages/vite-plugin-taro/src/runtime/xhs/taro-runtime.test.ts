import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { hooks, TaroHooks } from '@tarojs/shared'
import { build } from 'rolldown'
import { resolveVptRuntime } from '../../node/utils/packages.ts'
import './taro-runtime.ts'

test('declares both XHS recursive component Page properties without changing existing config', () => {
    const config = {
        properties: { i: { type: Object } },
        options: { virtualHost: true },
        methods: { eh: () => {} }
    }
    for (const isCustomWrapper of [false, true]) {
        // Taro declares the native-config hook using its unrelated MiniLifecycle type.
        const result = Reflect.apply(hooks.call, hooks, ['modifyRecursiveComponentConfig', config, { isCustomWrapper }])
        assert.deepEqual(result, {
            ...config,
            properties: { ...config.properties, p: { type: Object, value: { cn: [] } } }
        })
        assert.strictEqual(result.methods, config.methods)
        assert.strictEqual(result.options, config.options)
        assert.equal('p' in config.properties, false)
    }
})

test('uses XHS numeric setData indices and opts sharing into side-effect lifecycles immutably', () => {
    assert.equal(hooks.call('getPathIndex', 12), '12')
    // A fresh hook registry exposes Taro's shared defaults through its initial lifecycle implementation.
    const defaultHooks: typeof hooks = new TaroHooks(hooks.hooks)
    const defaults = defaultHooks.call('getMiniLifecycleImpl')
    assert.ok(defaults)
    const original = structuredClone(defaults)
    const lifecycle = hooks.call('getMiniLifecycleImpl')
    assert.ok(lifecycle)
    assert.deepEqual(lifecycle.page[5], [...original.page[5], 'onCopyUrl'])
    assert.deepEqual(lifecycle.page[6], [...original.page[6], 'onShareChat'])
    assert.deepEqual(hooks.call('getMiniLifecycleImpl'), lifecycle)
    assert.deepEqual(defaults, original)
})

test('creates and dispatches XHS native sharing callbacks only for explicitly enabled Pages', async () => {
    const entry = 'test:xhs-sharing-lifecycles'
    const result = await build({
        input: entry,
        platform: 'node',
        plugins: [
            {
                name: entry,
                resolveId(id) {
                    if (id === entry) {
                        return entry
                    }
                },
                load(id) {
                    if (id === entry) {
                        return `import ${JSON.stringify(resolveVptRuntime('xhs/taro-runtime'))}\n${sharingFixture}`
                    }
                }
            }
        ],
        transform: {
            define: {
                'process.env.TARO_ENV': '"xhs"',
                'process.env.TARO_PLATFORM': '"mini"',
                'process.env.NODE_ENV': '"test"',
                ENABLE_INNER_HTML: 'false',
                ENABLE_ADJACENT_HTML: 'false',
                ENABLE_CLONE_NODE: 'false',
                ENABLE_CONTAINS: 'false',
                ENABLE_MUTATION_OBSERVER: 'false',
                ENABLE_SIZE_APIS: 'false',
                ENABLE_TEMPLATE_CONTENT: 'false'
            }
        },
        output: { format: 'cjs' },
        write: false
    })
    const chunk = result.output[0]
    assert.ok(chunk?.type === 'chunk')
    runInNewContext(chunk.code, { exports: {}, require: createRequire(import.meta.url), console, global: {} })
})

const sharingFixture = `
import assert from 'node:assert/strict'
import { createPageConfig, injectPageInstance, removePageInstance } from 'vite-plugin-taro-runtime/runtime/mini'

function PageComponent() {}
const plain = createPageConfig(PageComponent, 'plain', {}, {})
assert.equal('onShareChat' in plain, false)
assert.equal('onShareTimeline' in plain, false)
assert.equal('onShareAppMessage' in plain, false)
assert.equal(typeof plain.onCopyUrl, 'function')

for (const name of ['onShareChat', 'onShareTimeline']) {
    const flag = name.replace(/^on/, 'enable')
    const flags = { [flag]: true, enableShareAppMessage: true }
    const sources = [
        { component: PageComponent, pageConfig: flags },
        { component: Object.assign(function Enabled() {}, flags), pageConfig: {} },
        { component: { [name]: () => ({}), onShareAppMessage: () => ({}) }, pageConfig: {} },
        { component: { prototype: { [name]: () => ({}), onShareAppMessage: () => ({}) } }, pageConfig: {} }
    ]
    for (const { component, pageConfig } of sources) {
        const config = createPageConfig(component, 'sharing', {}, pageConfig)
        assert.equal(typeof config[name], 'function')
        assert.equal(typeof config.onShareAppMessage, 'function')
        const payload = { title: name }
        const event = { from: 'menu' }
        injectPageInstance({ [name](received) { assert.strictEqual(received, event); return payload } }, 'sharing')
        assert.strictEqual(config[name].call({ $taroPath: 'sharing' }, event), payload)
        removePageInstance('sharing')
    }
    // Each explicit opt-in reaches the native platform, which owns sharing configuration diagnostics.
    const single = createPageConfig(PageComponent, 'single', {}, { [flag]: true })
    assert.equal(typeof single[name], 'function')
    assert.equal('onShareAppMessage' in single, false)
    const disabled = createPageConfig(PageComponent, 'disabled', {}, { [flag]: false })
    assert.equal(name in disabled, false)
}
const messageOnly = createPageConfig(PageComponent, 'message', {}, { enableShareAppMessage: true })
assert.equal(typeof messageOnly.onShareAppMessage, 'function')
assert.equal('onShareChat' in messageOnly, false)
assert.equal('onShareTimeline' in messageOnly, false)
`
