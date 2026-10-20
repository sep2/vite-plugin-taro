import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { normalizePath, resolveConfig } from 'vite'
import vpt from '../../index.ts'
import { rendererHostId } from '../../node/plugins/mini/module/module.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../node/utils/packages.ts'
import { createWxTestRoot } from './create-wx-test-root.ts'

const require = createRequire(import.meta.url)

for (const mode of ['development', 'production']) {
    test(`WX event storage (${mode}): lazy tables preserve native subscriptions and React callback updates`, async () => {
        const config = await resolveConfig(
            {
                configFile: false,
                plugins: vpt({ target: 'wx', app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
            },
            'build'
        )
        const renderer = resolveTaroRuntime('react')
        const entry = 'test:wx-event-storage'
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
                    async load(id) {
                        if (id === entry) {
                            return fixture
                        }
                        if (id === rendererHostId) {
                            return `import { createDomHost } from ${JSON.stringify(resolveVptRuntime('wx/create-dom-host'))}
                            export default createDomHost(instance => instance.root)`
                        }
                        if (normalizePath(id) === normalizePath(renderer)) {
                            return `${await readFile(renderer, 'utf8')}\nexport { hostConfig };`
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
                assert.fail('Event operations must be synchronous and must not schedule template work')
            },
            clearTimeout() {
                assert.fail('Event operations must not own timers')
            }
        })
    })
}

const fixture = `
import assert from 'node:assert/strict'
import { hooks } from '@tarojs/shared'
import 'vite-plugin-taro-runtime/plugin-platform-weapp/runtime'
import 'vite-plugin-taro-runtime/plugin-html/runtime'
import { document } from 'vite-plugin-taro-runtime/runtime/mini'
import { hostConfig } from 'vite-plugin-taro-runtime/react'
import host from '\\0vpt:renderer-host'

// Keep the shared Taro dispatch and native-bubbling batch while testing the renderer's prop diff directly.
hooks.tap('dispatchTaroEvent', (event, node) => node.dispatchEvent(event))
hooks.tap('batchedEventUpdates', callback => callback())
const app = { mount() {}, unmount() {} }
host.bindApp(app, document.createElement('root'))
app.mount(() => null, 'page', () => ({ root: globalThis.sdk }), () => {})
const context = host.getChildHostContext({}, host.getPageRootType('page'))
function element(type) { return host.createElement(null, context, type) }
function expectLazy(nodes) {
    for (const node of nodes) {
        assert.equal(Object.hasOwn(node, '__handlers'), false)
        assert.equal(Object.hasOwn(node, '_handlers'), false)
    }
}
const parent = element('view')
const gap = element('view')
const child = element('div')
const input = element('input')
const text = host.createText(null, context, 'text')
parent.appendChild(gap)
gap.appendChild(child)
gap.appendChild(input)
child.appendChild(text)
hostConfig.finalizeInitialChildren(child, 'div', { id: 'idle', className: 'layout' })
child.removeEventListener('click', () => {})
for (const node of [parent, gap, child, input, text]) {
    assert.equal(node.getEventHandlers('tap'), undefined)
    assert.equal(node.isAnyEventBinded(), false)
}
expectLazy([parent, gap, child, input, text])

// Intrinsic form delivery synchronizes values without requiring a business-handler table.
const intrinsic = input.nativeNode.listeners.input[0]
const target = { id: input.nativeNode.id, dataset: input.nativeNode.dataset }
intrinsic({ type: 'input', detail: { value: 'typed' }, target, currentTarget: target })
assert.equal(input.value, 'typed')
assert.strictEqual(input.nativeNode.listeners.input[0], intrinsic)
expectLazy([parent, gap, child, input, text])

// Callback replacements retain the SDK listener and logical array while aliases stay live.
const calls = []
parent.addEventListener('tap', () => calls.push('parent'))
const first = { onClick: () => calls.push('first') }
hostConfig.finalizeInitialChildren(child, 'div', first)
const listeners = child.getEventHandlers('tap')
const bridge = child.nativeNode.listeners.tap[0]
assert.strictEqual(child.getEventHandlers('click'), listeners)
const second = { onClick: () => calls.push('second') }
hostConfig.commitUpdate(child, 'div', first, second)
assert.strictEqual(child.getEventHandlers('tap'), listeners)
assert.equal(child.nativeNode.listeners.tap.length, 1)
assert.strictEqual(child.nativeNode.listeners.tap[0], bridge)
child.nativeNode.tap({})
assert.deepEqual(calls.splice(0), ['second', 'parent'])
expectLazy([gap, input, text])
const clone = child.cloneNode(true)
expectLazy([clone, ...clone.childNodes])
assert.equal(clone.nativeNode.listeners.tap, undefined)
hostConfig.commitUpdate(child, 'div', second, {})
assert.equal(child.nativeNode.listeners.tap.length, 0)
assert.strictEqual(child.getEventHandlers('tap'), listeners)
assert.equal(listeners.length, 0)

child.addEventListener('click', () => calls.push('once'), { once: true })
child.nativeNode.tap({})
child.nativeNode.tap({})
assert.deepEqual(calls.splice(0), ['once', 'parent', 'parent'])
assert.equal(child.nativeNode.listeners.tap.length, 0)
assert.strictEqual(child.getEventHandlers('tap'), listeners)
expectLazy([gap, input, text])
`
