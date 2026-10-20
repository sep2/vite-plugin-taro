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
        test(`lazy styles (${target}, ${mode}): allocation, reads, cloning and mutation semantics`, async () => {
            const config = await resolveConfig(
                {
                    configFile: false,
                    plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
                },
                'build'
            )
            const entry = 'test:lazy-style'
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
                    assert.fail('Recording lazy styles must not schedule template updates')
                }
            })
        })
    }
}

const fixture = `
import assert from 'node:assert/strict'
import { hooks } from '@tarojs/shared'
import { document, hydrate, MutationObserver, Style } from 'vite-plugin-taro-runtime/runtime/mini'

// Count real Style construction through its owner assignment, retaining the ordinary own data property.
const allocations = []
assert.equal(Object.hasOwn(Style.prototype, '_element'), false)
Object.defineProperty(Style.prototype, '_element', {
    configurable: true,
    set(element) {
        allocations.push(element)
        Object.defineProperty(this, '_element', {
            value: element, writable: true, enumerable: true, configurable: true
        })
    }
})
const root = document.createElement('root')
// Capture template work synchronously so style tests do not start the update scheduler.
const payloads = []
root.enqueueUpdate = payload => payloads.push(payload)
const nodes = ['view', 'text', 'input', 'image', 'div', 'comment'].map(type => document.createElement(type))
for (const node of nodes) {
    root.appendChild(node)
}
assert.deepEqual(allocations, [], 'element construction leaves style declarations unallocated')
for (const node of [root, ...nodes]) {
    assert.equal(node.getAttribute('style'), '')
    assert.equal(node.cssText, '')
    assert.deepEqual(node.attributes, [])
    assert.equal(node.hasAttributes(), false)
    assert.equal(node.hasAttribute('style'), false)
}
nodes[0].id = 'unstyled'
nodes[0].className = 'layout'
nodes[0].setAttribute('data-key', 'value')
nodes[0].removeAttribute('data-key')
assert.equal(hydrate(root).st, undefined)
const shallow = root.cloneNode(false)
const deep = root.cloneNode(true)
assert.equal(shallow.childNodes.length, 0)
assert.equal(deep.childNodes.length, nodes.length)
assert.equal(hydrate(deep).st, undefined)
assert.deepEqual(allocations, [], 'attribute reads, template hydration and unstyled clones remain lazy')

const node = nodes[0]
const observer = new MutationObserver(() => {})
observer.observe(root, { attributes: true, attributeOldValue: true, subtree: true })
const style = node.style
assert.ok(style instanceof Style)
assert.strictEqual(style._element, node)
assert.strictEqual(node.style, style)
assert.deepEqual(allocations, [node])
assert.deepEqual(observer.takeRecords(), [], 'first style access is not an attribute mutation')
payloads.length = 0
// Observer recording can read the same declaration during a property mutation.
const record = MutationObserver.record
MutationObserver.record = function (mutation) {
    if (mutation.target === node && mutation.attributeName === 'style') {
        assert.strictEqual(node.style, style)
    }
    return record.call(this, mutation)
}
try {
    style.color = 'red'
    assert.deepEqual(payloads.splice(0), [{ path: node._path + '.st', value: 'color: red;' }])
    style.color = 'red'
    assert.deepEqual(payloads, [])
    style.setProperty('--accent', 'gold')
    assert.equal(node.getAttribute('style'), 'color: red; --accent: gold;')
    assert.equal(hydrate(node).st, 'color: red; --accent: gold;')
    assert.deepEqual(node.attributes.find(attribute => attribute.name === 'style'), {
        name: 'style', value: 'color: red; --accent: gold;'
    })
    node.setAttribute('style', 'height: 8px; --accent: teal;')
    assert.equal(style.height, '8px')
    assert.equal(style.getPropertyValue('--accent'), 'teal')
    node.removeAttribute('style')
    assert.strictEqual(node.style, style)
    assert.equal(node.cssText, '')
    assert.deepEqual(observer.takeRecords().map(mutation => [mutation.attributeName, mutation.oldValue]), [
        ['style', ''],
        ['style', 'color: red;'],
        ['style', 'color: red; --accent: gold;'],
        ['style', 'height: 8px; --accent: teal;'],
        ['style', 'height: 8px; --accent: teal;']
    ])
    assert.deepEqual(allocations, [node], 'reads and mutations reuse the same Style')
} finally {
    MutationObserver.record = record
    observer.disconnect()
}

// A styled clone has independent declarations and dynamic property accessors.
style.cssText = 'color: purple; --accent: gold; -webkit-line-clamp: 2;'
const cloned = node.cloneNode(true)
assert.deepEqual(allocations, [node, cloned])
assert.notStrictEqual(cloned.style, style)
assert.strictEqual(cloned.style._element, cloned)
assert.equal(cloned.cssText, node.cssText)
cloned.style.setProperty('--accent', 'silver')
assert.equal(style.getPropertyValue('--accent'), 'gold')
assert.equal(cloned.style.removeProperty('-webkit-line-clamp'), '2')
assert.equal(style.getPropertyValue('-webkit-line-clamp'), '2')

// Explicit replacement retains the existing writable Style API.
const replacement = new Style(node)
node.style = replacement
assert.strictEqual(node.style, replacement)
assert.equal(node.cssText, '')
replacement.color = 'navy'
assert.equal(node.getAttribute('style'), 'color: navy;')
assert.deepEqual(allocations, [node, cloned, node])

// Creation hooks can obtain and mutate the stable declaration before the document factory returns.
const hookStyles = []
hooks.tap('patchElement', element => {
    const style = element.style
    hookStyles.push(style)
    style.color = 'green'
    assert.strictEqual(element.style, style)
})
const patched = document.createElement('view')
assert.strictEqual(patched.style, hookStyles[0])
assert.equal(patched.cssText, 'color: green;')
assert.deepEqual(allocations, [node, cloned, node, patched])
delete Style.prototype._element
`
