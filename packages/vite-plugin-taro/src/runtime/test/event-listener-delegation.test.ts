import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { resolveConfig } from 'vite'
import vpt from '../../index.ts'
import { resolveTaroRuntime } from '../../node/utils/packages.ts'

const require = createRequire(import.meta.url)

for (const mode of ['development', 'production'] as const) {
    test(`event listener delegation (${mode}): Taro owns handlers and host transitions`, async () => {
        const config = await resolveConfig(
            {
                configFile: false,
                mode,
                plugins: vpt({
                    target: 'tt',
                    app: 'src/app.tsx',
                    pages: [],
                    appJson: {},
                    projectConfigJson: {}
                })
            },
            mode === 'development' ? 'serve' : 'build'
        )
        const entry = 'test:event-listener-delegation'
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
                        if (id === '@tarojs/runtime') {
                            return resolveTaroRuntime('runtime/mini')
                        }
                    },
                    load(id) {
                        if (id === entry) {
                            return fixture
                        }
                    }
                }
            ],
            transform: { define: { ...config.define, 'process.env.NODE_ENV': JSON.stringify(mode) } },
            output: { format: 'cjs' },
            write: false
        })
        const chunk = result.output[0]
        assert.ok(chunk?.type === 'chunk')
        // Isolate prototype extensions and shared hooks. Detached logical updates must remain synchronous.
        runInNewContext(chunk.code, {
            exports: {},
            require,
            global: {},
            console,
            setTimeout() {
                assert.fail('Listener changes must not schedule rendering')
            }
        })
    })
}

const fixture = `
import assert from 'node:assert/strict'
import 'vite-plugin-taro-runtime/plugin-platform-tt/runtime'
import { document, TaroElement, TaroEvent, getComponentsAlias } from 'vite-plugin-taro-runtime/runtime/mini'

const first = () => {}
const second = () => {}
const aliases = getComponentsAlias()

// The default delegate retains template classification before addition and after removal.
for (const [name, active, inactive] of [
    ['view', 'view', 'pure-view'],
    ['text', 'text', 'static-text']
]) {
    const node = document.createElement(name)
    // Capture template effects at their existing payload boundary without a native Page or scheduler.
    const payloads = []
    node.enqueueUpdate = payload => payloads.push(payload)
    node.addEventListener('tap', first)
    assert.ok(payloads.length > 0)
    assert.ok(payloads.every(payload => payload.path.endsWith('.nn') && payload.value === aliases[active]._num))
    payloads.length = 0
    node.addEventListener('tap', second)
    node.removeEventListener('tap', first)
    assert.deepEqual(payloads, [])
    node.removeEventListener('tap', second)
    assert.ok(payloads.length > 0)
    assert.ok(payloads.every(payload => payload.value === aliases[inactive]._num))
    payloads.length = 0
    const options = { sideEffect: false }
    node.addEventListener('tap', first, options)
    assert.equal(Object.hasOwn(options, 'sideEffect'), false)
    node.removeEventListener('tap', first, false)
    assert.deepEqual(payloads, [])
}

const addEventListener = TaroElement.prototype.addEventListener
const removeEventListener = TaroElement.prototype.removeEventListener
// The recording host owns effects only; these arrays are test observations, not runtime subscription state.
const transitions = []
const effects = []
TaroElement.extend('delegateEventUpdate', function (added, sideEffect) {
    effects.push([this, added, sideEffect, this.__handlers.tap?.length ?? 0])
})
TaroElement.extend('delegateEventListener', function (type, subscribed) {
    assert.equal(this.__handlers[type].length > 0, subscribed, 'notification follows logical mutation')
    transitions.push([this, type, subscribed])
})
assert.strictEqual(TaroElement.prototype.addEventListener, addEventListener)
assert.strictEqual(TaroElement.prototype.removeEventListener, removeEventListener)

function createNode(name) {
    const node = document.createElement(name)
    // Indexed handler access is sufficient. Any classification scan, serialized path or template write fails.
    node.__handlers = new Proxy(node.__handlers, {
        ownKeys() { assert.fail('Host listener delegation must not enumerate event names') }
    })
    node.isAnyEventBinded = () => assert.fail('Template classification must remain inside its delegate')
    node.enqueueUpdate = () => assert.fail('Host listener delegation must not prepare template payloads')
    Object.defineProperty(node, '_path', { get() { assert.fail('Host listener delegation must not read paths') } })
    return node
}
function expectTransitions(node, expected) {
    assert.deepEqual(transitions.splice(0), expected.map(([type, subscribed]) => [node, type, subscribed]))
}

const node = createNode('view')
node.addEventListener('TaP', first)
const handlers = node.__handlers.tap
assert.strictEqual(handlers[0].oldHandler, first)
node.addEventListener('tap', second, { sideEffect: false })
assert.strictEqual(node.__handlers.tap, handlers)
node.removeEventListener('TAP', first, false)
node.removeEventListener('tap', second)
assert.strictEqual(node.__handlers.tap, handlers)
assert.deepEqual(effects.splice(0), [
    [node, true, true, 0],
    [node, true, false, 1],
    [node, false, false, 1],
    [node, false, true, 0]
])
expectTransitions(node, [['tap', true], ['tap', false]])
node.addEventListener('tap', first, { sideEffect: false })
node.removeEventListener('tap', second)
assert.equal(handlers.length, 1, 'an unregistered handler must not remove a registered handler')
node.removeEventListener('tap', undefined)
node.removeEventListener('absent', first)
expectTransitions(node, [['tap', true]])
node.removeEventListener('tap', first, false)
node.removeEventListener('tap', first)
expectTransitions(node, [['tap', false]])

// Existing Taro dispatch and once wrappers operate on the same logical receiver and handler arrays.
const calls = []
function listener(event) { calls.push([this, event.type]) }
node.addEventListener('tap', listener, { once: true })
node.dispatchEvent(new TaroEvent('tap'))
node.dispatchEvent(new TaroEvent('tap'))
assert.deepEqual(calls.splice(0), [[node, 'tap']])
expectTransitions(node, [['tap', true], ['tap', false]])
node.addEventListener('tap', first)
node.addEventListener('tap', listener, { once: true })
node.dispatchEvent(new TaroEvent('tap'))
assert.equal(handlers.length, 1)
expectTransitions(node, [['tap', true]])
node.removeEventListener('tap', first)
expectTransitions(node, [['tap', false]])
assert.deepEqual(calls.splice(0), [[node, 'tap']])

// Regionchange expansion is Taro's logical contract; platform binding names are a separate host concern.
const map = createNode('map')
map.addEventListener('RegionChange', listener)
map.addEventListener('regionchange', first)
assert.equal(map.__handlers.regionchange, undefined)
map.dispatchEvent(new TaroEvent('begin'))
map.dispatchEvent(new TaroEvent('end'))
assert.deepEqual(calls.splice(0), [[map, 'begin'], [map, 'end']])
map.removeEventListener('regionchange', listener)
map.removeEventListener('regionchange', first)
expectTransitions(map, [['begin', true], ['end', true], ['begin', false], ['end', false]])

// Custom component event names retain Taro's lowercase normalization.
const custom = createNode('custom-component')
custom.addEventListener('CustomEvent', first)
custom.removeEventListener('CUSTOMEVENT', first)
expectTransitions(custom, [['customevent', true], ['customevent', false]])
`
