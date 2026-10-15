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
    test(`TT ${mode}: known logical nodes share Taro's native event pipeline`, async () => {
        const config = await resolveConfig(
            {
                configFile: false,
                mode,
                plugins: vpt({ target: 'tt', app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
            },
            mode === 'development' ? 'serve' : 'build'
        )
        const entry = 'test:node-event-dispatch'
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
                    load: (id) => (id === entry ? fixture : undefined)
                }
            ],
            transform: { define: { ...config.define, 'process.env.NODE_ENV': JSON.stringify(mode) } },
            output: { format: 'cjs' },
            write: false
        })
        const chunk = result.output[0]
        assert.ok(chunk?.type === 'chunk')
        for (const useNode of [false, true]) {
            // Each entry mode owns its singleton hooks and pending native-bubbling batch.
            runInNewContext(chunk.code, {
                exports: {},
                require,
                global: {},
                console,
                useNode,
                setTimeout() {
                    assert.fail('Native event dispatch must remain synchronous')
                }
            })
        }
    })
}

const fixture = `
import assert from 'node:assert/strict'
import 'vite-plugin-taro-runtime/plugin-platform-tt/runtime'
import { document, eventHandler, hooks, TaroEvent, EVENT_CALLBACK_RESULT } from 'vite-plugin-taro-runtime/runtime/mini'

function send(node, event) {
    return useNode ? eventHandler(event, node) : eventHandler(event)
}
function nativeEvent(node, type, detail) {
    return { type, detail, target: { id: node.sid }, currentTarget: { dataset: { sid: node.sid } } }
}

// Record the shared hooks around actual logical dispatch; only receiver resolution differs between entries.
const trace = []
hooks.tap('modifyTaroEvent', (event, node) => trace.push(['modify', node, event.type]))
hooks.tap('dispatchTaroEventFinish', (event, node) => trace.push(['finish', node, event.type]))
const node = document.createElement('view')
node.addEventListener('tap', function (event) {
    assert.strictEqual(this, node)
    assert.ok(event instanceof TaroEvent)
    assert.equal(event.bubbles, true)
    assert.equal(event.cancelable, true)
    trace.push(['handler', node, event.type])
})
const lookup = document.getElementById
// Count existing index access. A host already holding the receiver must not resolve it again.
const lookups = []
document.getElementById = function (id) {
    lookups.push(id)
    return lookup.call(this, id)
}
const tap = nativeEvent(node, 'tap', {})
assert.equal(send(node, tap), undefined)
assert.deepEqual(lookups.splice(0), useNode ? [] : [node.sid])
assert.deepEqual(trace.splice(0), [['modify', node, 'tap'], ['handler', node, 'tap'], ['finish', node, 'tap']])

if (useNode) {
    // The callback's logical receiver is authoritative even when the native event has no matching index entry.
    const unknown = { type: 'tap', detail: {}, target: { id: 'native-only' } }
    send(node, unknown)
    assert.strictEqual(unknown.currentTarget, unknown.target)
    assert.deepEqual(lookups, [])
    assert.deepEqual(trace.splice(0), [['modify', node, 'tap'], ['handler', node, 'tap'], ['finish', node, 'tap']])
} else {
    eventHandler({ type: 'tap', detail: {}, target: { id: 'absent' } })
    assert.deepEqual(lookups.splice(0), ['absent'])
    assert.deepEqual(trace, [])
}
document.getElementById = lookup

// Both entries retain the original missing-field normalization before platform hooks and dispatch.
const normalized = { _type: 'tap', _detail: { value: 'payload' }, target: { id: node.sid } }
send(node, normalized)
assert.equal(normalized.type, 'tap')
assert.strictEqual(normalized.detail, normalized._detail)
assert.strictEqual(normalized.currentTarget, normalized.target)
assert.deepEqual(trace.splice(0), [['modify', node, 'tap'], ['handler', node, 'tap'], ['finish', node, 'tap']])

const map = document.createElement('map')
map.addEventListener('regionchange', function (event) {
    assert.strictEqual(this, map)
    assert.equal(event.type, event.detail.type)
    trace.push(['region', map, event.type])
})
for (const type of ['begin', 'end']) {
    const event = nativeEvent(map, 'regionchange', { type })
    send(map, event)
    assert.equal(event.type, type, 'TT normalization precedes logical event selection')
    assert.deepEqual(trace.splice(0), [['modify', map, type], ['region', map, type], ['finish', map, type]])
}

const input = document.createElement('input')
input.addEventListener('input', function (event) {
    assert.equal(this.value, 'edited')
    assert.equal(event.target.value, 'edited')
    assert.equal(event.currentTarget.value, 'edited')
})
send(input, nativeEvent(input, 'input', { value: 'edited' }))
assert.equal(input.value, 'edited')
input.addEventListener('confirm', event => assert.equal(event.keyCode, 13))
send(input, nativeEvent(input, 'confirm', {}))
trace.length = 0

const payButton = document.createElement('pay-button')
const returnValue = { accepted: true }
payButton.addEventListener('applyrefund', () => returnValue)
const refund = nativeEvent(payButton, 'applyrefund', {})
assert.strictEqual(send(payButton, refund), returnValue)
assert.equal(Object.hasOwn(refund, EVENT_CALLBACK_RESULT), false, 'callback result is consumed by the shared entry')
trace.length = 0

// Exercise Taro's existing batch: native bubbling delivers the child callback, then the parent callback.
hooks.tap('batchedEventUpdates', callback => {
    trace.push('batch:start')
    try {
        return callback()
    } finally {
        trace.push('batch:end')
    }
})
const parent = document.createElement('view')
const child = document.createElement('view')
parent.appendChild(child)
parent.addEventListener('tap', () => trace.push('parent'))
child.addEventListener('tap', () => trace.push('child'))
const childTap = nativeEvent(child, 'tap', {})
send(child, childTap)
assert.deepEqual(trace, [], 'child dispatch waits for the existing native-bubbling batch boundary')
const parentTap = nativeEvent(parent, 'tap', {})
parentTap.target = childTap.target
send(parent, parentTap)
assert.deepEqual(trace.splice(0), [
    'batch:start',
    ['modify', child, 'tap'], 'child', ['finish', child, 'tap'],
    ['modify', parent, 'tap'], 'parent', ['finish', parent, 'tap'],
    'batch:end'
])

child.addEventListener('tap', event => event.stopPropagation(), { once: true })
send(child, nativeEvent(child, 'tap', {}))
send(parent, parentTap)
assert.deepEqual(trace.splice(0), [
    'batch:start',
    ['modify', child, 'tap'], 'child', ['finish', child, 'tap'],
    ['modify', parent, 'tap'], ['finish', parent, 'tap'],
    'batch:end'
])

child.addEventListener('scroll', () => trace.push('scroll'))
send(child, nativeEvent(child, 'scroll', {}))
assert.deepEqual(trace.splice(0), ['batch:start', ['modify', child, 'scroll'], 'scroll', ['finish', child, 'scroll'], 'batch:end'])
parent.addEventListener('touchmove', () => assert.fail('Native catchMove stops at the child'))
child.addEventListener('touchmove', () => trace.push('move'))
child.setAttribute('catchMove', true)
send(child, nativeEvent(child, 'touchmove', {}))
assert.deepEqual(trace.splice(0), ['batch:start', ['modify', child, 'touchmove'], 'move', ['finish', child, 'touchmove'], 'batch:end'])
assert.strictEqual(send(payButton, nativeEvent(payButton, 'applyrefund', {})), returnValue)
trace.length = 0

const failure = new Error('handler failure')
node.addEventListener('error', () => { throw failure })
assert.throws(() => send(node, nativeEvent(node, 'error', {})), error => error === failure)
assert.deepEqual(trace, ['batch:start', ['modify', node, 'error'], 'batch:end'])
`
