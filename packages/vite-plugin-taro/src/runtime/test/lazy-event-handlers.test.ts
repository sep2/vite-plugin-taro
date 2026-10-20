import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { resolveConfig } from 'vite'
import vpt from '../../index.ts'
import { resolveTaroRuntime } from '../../node/utils/packages.ts'

const require = createRequire(import.meta.url)

for (const target of ['wx', 'zfb', 'tt'] as const) {
    for (const mode of ['development', 'production'] as const) {
        test(`lazy event handlers (${target}, ${mode}): storage, propagation and listener identity`, async () => {
            const config = await resolveConfig(
                {
                    configFile: false,
                    plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
                },
                'build'
            )
            const entry = 'test:lazy-event-handlers'
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
                transform: {
                    define: {
                        ...config.define,
                        'process.env.NODE_ENV': JSON.stringify(mode),
                        ENABLE_MUTATION_OBSERVER: 'true'
                    }
                },
                output: { format: 'cjs' },
                write: false
            })
            const chunk = result.output[0]
            assert.ok(chunk?.type === 'chunk')
            runInNewContext(chunk.code, {
                exports: {},
                require,
                global: {},
                console,
                setTimeout() {
                    assert.fail('Recording lazy event handlers must not schedule template updates')
                }
            })
        })
    }
}

const fixture = `
import assert from 'node:assert/strict'
import 'vite-plugin-taro-runtime/plugin-html/runtime'
import { document, hydrate, isParentBound, TaroEvent } from 'vite-plugin-taro-runtime/runtime/mini'

function expectLazy(nodes) {
    for (const node of nodes) {
        assert.equal(Object.hasOwn(node, '__handlers'), false, 'construction must not allocate a handler table')
        assert.equal(Object.hasOwn(node, '_handlers'), false, 'read-only operations must preserve lazy storage')
    }
}
const root = document.createElement('root')
// Capture template mutations synchronously while exercising the shared event and attribute paths.
const payloads = []
root.enqueueUpdate = payload => payloads.push(payload)
const nodes = ['view', 'text', 'input', 'div', 'map'].map(type => document.createElement(type))
const text = document.createTextNode('text')
const comment = document.createComment('anchor')
for (const node of [...nodes, text, comment]) {
    root.appendChild(node)
}
expectLazy([root, ...nodes, text, comment])
const unused = () => {}
for (const node of [root, ...nodes, text, comment]) {
    assert.equal(node.isAnyEventBinded(), false)
    assert.equal(node.isOnlyClickBinded(), false)
    assert.equal(node.getEventHandlers('tap'), undefined)
    node.removeEventListener('tap', unused, false)
    node.removeEventListener('regionchange', unused, false)
}
for (const node of nodes) {
    assert.equal(node.dispatchEvent(new TaroEvent('tap')), false)
    node.setAttribute('title', 'label')
    node.removeAttribute('title')
    assert.equal(isParentBound(node, 'tap'), false)
}
hydrate(root)
const cloned = root.cloneNode(true)
expectLazy([root, ...nodes, text, comment, cloned, ...cloned.childNodes])

// Materialization preserves one mutable table and the original handler-array identity after removal.
const node = nodes[0]
// Listener calls are recorded in dispatch order, including recursive once removal and propagation.
const calls = []
function first() { calls.push('first') }
function second() { calls.push('second') }
node.addEventListener('TaP', first)
const table = node.__handlers
const handlers = node.getEventHandlers('tap')
assert.strictEqual(node.__handlers, table)
assert.strictEqual(handlers, table.tap)
assert.equal(handlers.length, 1)
assert.strictEqual(handlers[0].oldHandler, first)
assert.equal(node.isAnyEventBinded(), true)
assert.equal(node.isOnlyClickBinded(), true)
node.addEventListener('tap', second)
assert.strictEqual(node.getEventHandlers('tap'), handlers)
node.dispatchEvent(new TaroEvent('tap'))
assert.deepEqual(calls.splice(0), ['second', 'first'])
node.removeEventListener('tap', unused, false)
assert.equal(handlers.length, 2)
node.removeEventListener('tap', first, false)
node.removeEventListener('tap', second, false)
assert.strictEqual(node.__handlers, table)
assert.strictEqual(node.getEventHandlers('tap'), handlers)
assert.equal(handlers.length, 0)
assert.equal(node.isAnyEventBinded(), false)
assert.equal(node.isOnlyClickBinded(), true, 'the retained tap key keeps its existing classification')
node.addEventListener('tap', first, { once: true })
node.dispatchEvent(new TaroEvent('tap'))
node.dispatchEvent(new TaroEvent('tap'))
assert.deepEqual(calls.splice(0), ['first'])
assert.strictEqual(node.getEventHandlers('tap'), handlers)
assert.equal(handlers.length, 0)
expectLazy([node.cloneNode(true)])

// HTML aliases retain live accessors pointing at the same array.
const html = nodes[3]
html.addEventListener('click', first)
assert.strictEqual(html.getEventHandlers('click'), html.getEventHandlers('tap'))
html.dispatchEvent(new TaroEvent('tap'))
assert.deepEqual(calls.splice(0), ['first'])
html.removeEventListener('click', first, false)
assert.equal(html.getEventHandlers('tap').length, 0)
const input = nodes[2]
input.addEventListener('change', first)
assert.strictEqual(input.getEventHandlers('change'), input.getEventHandlers('input'))
input.dispatchEvent(new TaroEvent('input'))
assert.deepEqual(calls.splice(0), ['first'])
input.removeEventListener('change', first, false)
assert.equal(input.getEventHandlers('input').length, 0)

// Existing wrappers and expanded event names remain independent per target.
const map = nodes[4]
map.addEventListener('regionchange', first)
assert.equal(map.getEventHandlers('regionchange'), undefined)
map.dispatchEvent(new TaroEvent('begin'))
map.dispatchEvent(new TaroEvent('end'))
assert.deepEqual(calls.splice(0), ['first', 'first'])
map.removeEventListener('regionchange', first, false)
assert.equal(map.isAnyEventBinded(), false)

// Parent queries and stop-propagation cross listener-free ancestors without creating their tables.
const ancestor = document.createElement('view')
const gap = document.createElement('view')
const leaf = document.createElement('view')
root.appendChild(ancestor)
ancestor.appendChild(gap)
gap.appendChild(leaf)
ancestor.addEventListener('tap', first)
leaf.addEventListener('tap', event => { calls.push('leaf'); event.stopPropagation() })
assert.equal(isParentBound(leaf, 'tap'), true)
assert.equal(isParentBound(leaf, 'scroll'), false)
leaf.dispatchEvent(new TaroEvent('tap', { cancelable: true }))
ancestor.dispatchEvent(new TaroEvent('tap', { cancelable: true }))
assert.deepEqual(calls.splice(0), ['leaf'])
ancestor.dispatchEvent(new TaroEvent('tap'))
assert.deepEqual(calls.splice(0), ['first'])
expectLazy([root, gap, text, comment])
ancestor.removeEventListener('tap', first, false)
assert.equal(isParentBound(leaf, 'tap'), false)

// Explicit mutable access and replacement remain supported, including proxy-backed tables.
const mutable = document.createElement('view')
const mutableTable = mutable.__handlers
assert.deepEqual(mutableTable, {})
assert.strictEqual(mutable.__handlers, mutableTable)
const replacement = new Proxy({ tap: [first] }, {
    ownKeys() { assert.fail('Single-event lookup and dispatch must not enumerate handler names') }
})
mutable.__handlers = replacement
assert.strictEqual(mutable.__handlers, replacement)
assert.strictEqual(mutable.getEventHandlers('tap'), replacement.tap)
mutable.dispatchEvent(new TaroEvent('tap'))
assert.deepEqual(calls.splice(0), ['first'])
`
