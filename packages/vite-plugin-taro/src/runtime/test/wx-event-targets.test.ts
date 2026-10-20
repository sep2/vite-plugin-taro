import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { resolveConfig } from 'vite'
import vpt from '../../index.ts'
import { rendererHostId } from '../../node/plugins/mini/module/module.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../node/utils/packages.ts'
import { createWxTestRoot } from './create-wx-test-root.ts'

const require = createRequire(import.meta.url)

for (const mode of ['development', 'production']) {
    test(`WX event targets (${mode}): SDK datasets and direct receiver dispatch`, async () => {
        const config = await resolveConfig(
            {
                configFile: false,
                plugins: vpt({ target: 'wx', app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
            },
            'build'
        )
        const entry = 'test:wx-event-targets'
        const result = await build({
            input: entry,
            platform: 'node',
            plugins: [
                {
                    name: entry,
                    resolveId(id) {
                        if (id === entry || id === rendererHostId) {
                            return id
                        }
                        if (id === '@tarojs/runtime') {
                            return resolveTaroRuntime('runtime/mini')
                        }
                    },
                    load(id) {
                        if (id === entry) {
                            return fixture
                        }
                        if (id === rendererHostId) {
                            return `import { createDomHost } from ${JSON.stringify(resolveVptRuntime('wx/create-dom-host'))}
                            export default createDomHost(instance => instance.root)`
                        }
                    }
                }
            ],
            transform: { define: { ...config.define, 'process.env.NODE_ENV': JSON.stringify(mode) } },
            output: { format: 'cjs' },
            write: false
        })
        const chunk = result.output[0]
        assert(chunk?.type === 'chunk')
        runInNewContext(chunk.code, {
            exports: {},
            require,
            console,
            global: {},
            sdk: createWxTestRoot(),
            setTimeout() {
                assert.fail('Native events must be synchronous and must not schedule template work')
            },
            clearTimeout() {
                assert.fail('Native events must not own timers')
            }
        })
    })
}

const fixture = `
import assert from 'node:assert/strict'
import { hooks } from '@tarojs/shared'
import 'vite-plugin-taro-runtime/plugin-platform-weapp/runtime'
import { document, eventSource, TaroEvent } from 'vite-plugin-taro-runtime/runtime/mini'
import host from '\\0vpt:renderer-host'

hooks.tap('dispatchTaroEvent', (event, node) => node.dispatchEvent(event))
hooks.tap('batchedEventUpdates', callback => callback())
// Record adapter dataset writes separately from SDK element construction.
const writes = []
const createComponent = globalThis.sdk.createComponent
globalThis.sdk.createComponent = function (name) {
    const native = createComponent.call(this, name)
    const setDataset = native.setDataset
    native.setDataset = function (key, value) {
        writes.push([this, key, value])
        return setDataset.call(this, key, value)
    }
    return native
}
const app = { mount() {}, unmount() {} }
host.bindApp(app, document.createElement('root'))
app.mount(() => null, 'page', () => ({ root: globalThis.sdk }), () => {})
const type = host.getPageRootType('page')
const context = host.getChildHostContext({}, type)
const root = host.createElement(null, {}, type)
function element(type) { return host.createElement(root, context, type) }
const parent = element('view')
const gap = element('view')
const child = element('view')
const input = element('input')
const custom = element('native-card')
const text = host.createText(root, context, 'text')
root.appendChild(parent)
parent.appendChild(gap)
gap.appendChild(child)
gap.appendChild(input)
child.appendChild(text)
assert.equal(writes.length, 0, 'element creation must not write internal dataset metadata')
for (const node of [root, parent, gap, child, input, custom]) {
    assert.equal(Object.hasOwn(node.nativeNode.dataset, 'sid'), false)
    assert.strictEqual(eventSource.get(node.sid), node, 'logical SID registration is retained')
}
const object = { value: 7 }
child.setAttribute('data-payload', object)
child.setAttribute('data-role', 'child')
parent.setAttribute('data-role', 'parent')

// Receiver capture and SDK records make event delivery independent of logical ID lookup.
const lookup = document.getElementById
document.getElementById = () => assert.fail('Native event targets must use SDK records')
try {
    // Record callback order across native bubbling and subscription changes.
    const events = []
    parent.addEventListener('tap', event => {
        assert.equal(event.target.dataset.role, child.nativeNode.dataset.role)
        assert.strictEqual(event.target.dataset.payload, child.nativeNode.dataset.payload)
        assert.strictEqual(event.currentTarget.dataset, event.mpEvent.currentTarget.dataset)
        assert.equal(event.currentTarget.dataset.role, 'parent')
        assert.notStrictEqual(event.target, event.currentTarget)
        assert.strictEqual(event.target, event.target)
        assert.strictEqual(event.currentTarget, event.currentTarget)
        assert.equal(event.target.value, 42)
        assert.equal(event.currentTarget.value, 42)
        assert.equal(Object.hasOwn(event.mpEvent.target, 'value'), false)
        events.push('parent')
    })
    child.nativeNode.tap({ value: 42 })
    assert.deepEqual(events.splice(0), ['parent'], 'an ID-less target without a listener still bubbles')

    parent.id = 'shared'
    child.id = 'shared'
    parent.dataset.role = 'logical-only'
    child.nativeNode.tap({ value: 42 })
    assert.deepEqual(events.splice(0), ['parent'], 'SDK datasets remain authoritative for duplicate IDs')

    child.setAttribute('data-role', 'updated')
    child.removeAttribute('data-payload')
    child.nativeNode.tap({ value: 42 })
    assert.deepEqual(events.splice(0), ['parent'])

    // Batched child and parent callbacks retain their receiver and ordering.
    child.addEventListener('tap', () => events.push('child'), { once: true })
    child.nativeNode.tap({ value: 42 })
    assert.deepEqual(events.splice(0), ['child', 'parent'])
    child.nativeNode.tap({ value: 42 })
    assert.deepEqual(events.splice(0), ['parent'])
    const bridge = parent.nativeNode.listeners.tap[0]
    gap.removeChild(child)
    gap.appendChild(child)
    child.nativeNode.tap({ value: 42 })
    assert.deepEqual(events.splice(0), ['parent'])
    assert.strictEqual(parent.nativeNode.listeners.tap[0], bridge)

    const target = { id: '', dataset: { role: 'input' } }
    input.nativeNode.listeners.input[0]({ type: 'input', detail: { value: 'typed' }, target, currentTarget: target })
    assert.equal(input.value, 'typed')
    const same = new TaroEvent('input', { bubbles: true, cancelable: true },
        { target, currentTarget: target, detail: { value: 'typed' } })
    assert.strictEqual(same.target, same.currentTarget)
    assert.equal(same.target.value, 'typed')
    assert.equal(Object.hasOwn(target, 'value'), false)

    custom.addEventListener('select', event => {
        assert.equal(event.target.dataset.role, 'component')
        assert.equal(event.target.selected, 'choice')
        events.push(event.type)
    })
    const componentTarget = { id: '', dataset: { role: 'component' } }
    custom.nativeNode.listeners.select[0]({
        type: 'select', detail: { selected: 'choice' }, target: componentTarget, currentTarget: componentTarget
    })
    assert.deepEqual(events.splice(0), ['select'])
} finally {
    document.getElementById = lookup
}
assert.strictEqual(document.getElementById(parent.sid), parent)
assert.strictEqual(document.getElementById(parent.id), null, 'removal cleaned the shared ID alias normally')
`
