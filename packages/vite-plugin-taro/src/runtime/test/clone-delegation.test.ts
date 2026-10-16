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
        test(`clone delegation (${target}, ${mode}): identity and construction`, async () => {
            const config = await resolveConfig(
                {
                    configFile: false,
                    plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
                },
                'build'
            )
            const entry = 'test:clone-delegation'
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
                    assert.fail('Cloning detached elements must not schedule template updates')
                }
            })
        })
    }
}

const fixture = `
import assert from 'node:assert/strict'
import { document, MutationObserver, TaroRootElement } from 'vite-plugin-taro-runtime/runtime/mini'

const node = document.createElement('view')
node.id = 'clone-source'
node.setAttribute('data-item-key', 'item')
node.setAttribute('object-value', { stable: true })
node.style.cssText = 'color: red; --accent: gold; -webkit-line-clamp: 2;'
node.addEventListener('tap', () => {})
const child = document.createElement('input')
child.value = 'retained'
child.appendChild(document.createTextNode('child text'))
node.appendChild(child)
const record = MutationObserver.record
MutationObserver.record = () => assert.fail('clone construction must not publish mutation records')
// Capture results under the observer guard, then restore the runtime before ordinary mutations.
let shallow, deep, text
try {
    shallow = node.cloneNode()
    deep = node.cloneNode(true)
    text = child.firstChild.cloneNode(true)
} finally {
    MutationObserver.record = record
}
assert.equal(shallow.childNodes.length, 0)
for (const clone of [shallow, deep]) {
    assert.notStrictEqual(clone, node)
    assert.notEqual(clone.sid, node.sid)
    assert.notEqual(clone.uid, node.uid)
    assert.equal(clone.id, 'clone-source')
    assert.strictEqual(document.getElementById('clone-source'), node, 'cloning does not replace the original ID lookup')
    assert.strictEqual(document.getElementById(clone.sid), clone)
    assert.notStrictEqual(clone.props, node.props)
    assert.strictEqual(clone.props['object-value'], node.props['object-value'])
    assert.notStrictEqual(clone.dataset, node.dataset)
    assert.equal(clone.dataset.itemKey, 'item')
    assert.notStrictEqual(clone.style._value, node.style._value)
    assert.notStrictEqual(clone.style._usedStyleProp, node.style._usedStyleProp)
    assert.equal(clone.style.cssText, node.style.cssText)
    assert.equal(clone.style.getPropertyValue('-webkit-line-clamp'), '2')
    assert.equal(clone.__handlers.tap, undefined)
    assert.equal(clone.parentNode, null)
    clone.style.setProperty('--accent', 'green')
    assert.equal(node.style.getPropertyValue('--accent'), 'gold')
    assert.equal(clone.style.removeProperty('-webkit-line-clamp'), '2')
    clone.style.cssText = ''
    assert.equal(clone.style.cssText, '')
}
assert.equal(text.nodeValue, 'child text')
assert.equal(text.parentNode, null)
assert.notEqual(text.sid, child.firstChild.sid)
assert.equal(deep.firstChild.nodeName, 'input')
assert.notStrictEqual(deep.firstChild, child)
assert.strictEqual(deep.firstChild.parentNode, deep)
assert.strictEqual(deep.firstChild.firstChild.parentNode, deep.firstChild)
assert.equal(deep.firstChild.value, 'retained')
assert.equal(deep.firstChild.firstChild.nodeValue, 'child text')
assert.equal(deep.firstChild.nextSibling, null)
deep.firstChild.value = 'changed'
assert.equal(child.value, 'retained')

// A wide deep clone constructs edges once without invoking sibling searches or public mutation methods.
const wide = document.createElement('view')
for (let index = 0; index < 100; index++) {
    wide.appendChild(document.createElement('text'))
}
const prototype = Object.getPrototypeOf(Object.getPrototypeOf(wide))
const findIndex = prototype.findIndex
prototype.findIndex = () => assert.fail('clone must not search siblings')
try {
    const cloned = wide.cloneNode(true)
    assert.equal(cloned.childNodes.length, 100)
    for (const element of cloned.childNodes) {
        assert.strictEqual(element.parentNode, cloned)
    }
} finally {
    prototype.findIndex = findIndex
}

// A root is its own scheduler even while detached. Cloning copies its data without preparing updates.
const root = document.createElement('root')
root.id = 'clone-root'
root.style.cssText = 'color: red; --accent: gold;'
for (let index = 0; index < 32; index++) {
    root.appendChild(document.createTextNode(String(index)))
}
const sourcePayloads = root.updatePayloads.slice()
const pathDescriptor = Object.getOwnPropertyDescriptor(TaroRootElement.prototype, '_path')
// The temporary trap distinguishes skipping payload preparation from merely discarding queued payloads.
Object.defineProperty(TaroRootElement.prototype, '_path', {
    configurable: true,
    get() { assert.fail('clone construction must not calculate template paths') }
})
let clonedRoot, shallowRoot
try {
    clonedRoot = root.cloneNode(true)
    shallowRoot = root.cloneNode(false)
} finally {
    Object.defineProperty(TaroRootElement.prototype, '_path', pathDescriptor)
}
for (const clone of [clonedRoot, shallowRoot]) {
    assert.ok(clone instanceof TaroRootElement)
    assert.equal(clone.parentNode, null)
    assert.strictEqual(clone._root, clone)
    assert.equal(clone.id, 'clone-root')
    assert.equal(clone.style.cssText, root.style.cssText)
    assert.equal(clone.ctx, null)
    assert.equal(clone.pendingUpdate, false)
    assert.deepEqual(clone.updatePayloads, [])
}
assert.equal(shallowRoot.childNodes.length, 0)
assert.equal(clonedRoot.childNodes.length, 32)
for (const [index, child] of clonedRoot.childNodes.entries()) {
    assert.strictEqual(child.parentNode, clonedRoot)
    assert.equal(child.nodeValue, String(index))
}
assert.strictEqual(document.getElementById('clone-root'), root)
assert.deepEqual(root.updatePayloads, sourcePayloads)
// Ordinary mutations of a cloned root retain the normal template scheduler behavior.
clonedRoot.style.color = 'blue'
assert.deepEqual(clonedRoot.updatePayloads.splice(0), [{ path: 'root.st', value: 'color: blue; --accent: gold;' }])
clonedRoot.setAttribute('data-after', 'live')
assert.equal(clonedRoot.updatePayloads.length, 1)
assert.equal(clonedRoot.updatePayloads[0].value, 'live')
`
