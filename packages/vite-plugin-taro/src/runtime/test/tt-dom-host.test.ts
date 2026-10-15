import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'rolldown'
import { normalizePath, resolveConfig } from 'vite'
import vpt from '../../index.ts'
import { rendererHostId } from '../../node/plugins/mini/module/module.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../node/utils/packages.ts'

const require = createRequire(import.meta.url)

for (const mode of ['development', 'production'] as const) {
    test(`TT DOM host (${mode}): Taro mutations directly update stable native nodes`, async (t) => {
        // Own React scheduler resources for this isolated runtime, including failed-assertion cleanup.
        const timers = new Set<ReturnType<typeof setTimeout>>()
        const immediates = new Set<ReturnType<typeof setImmediate>>()
        t.after(() => {
            for (const timer of timers) {
                clearTimeout(timer)
            }
            for (const immediate of immediates) {
                clearImmediate(immediate)
            }
        })
        const config = await resolveConfig(
            {
                configFile: false,
                plugins: vpt({ target: 'tt', app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
            },
            'build'
        )
        const entry = 'test:tt-dom-host-fixture'
        const hostModule = 'test:tt-dom-host'
        const outputFile = fileURLToPath(new URL(`./tt-dom-host-${mode}-fixture.js`, import.meta.url))
        const runtimeRoot = normalizePath(fileURLToPath(new URL('../', import.meta.url)))
        const result = await build({
            input: entry,
            platform: 'node',
            plugins: [
                {
                    name: entry,
                    resolveId(id) {
                        if (id === entry || id === hostModule) {
                            return id
                        }
                        if (id === rendererHostId) {
                            return hostModule
                        }
                        if (id === '@tarojs/runtime') {
                            return resolveTaroRuntime('runtime/mini')
                        }
                    },
                    load(id) {
                        if (id === entry) {
                            return fixture
                        }
                        if (id === hostModule) {
                            return `import { createDomHost } from ${JSON.stringify(resolveVptRuntime('tt/create-dom-host'))}\n${nativeModel}`
                        }
                    },
                    transform(code, id) {
                        if (!normalizePath(id).startsWith(runtimeRoot)) {
                            return { code, map: { version: 3, sources: [], names: [], mappings: '' } }
                        }
                    }
                }
            ],
            transform: { define: { ...config.define, 'process.env.NODE_ENV': JSON.stringify(mode) } },
            output: {
                file: outputFile,
                format: 'cjs',
                postBanner:
                    'export default function(exports, require, globalThis, global, setTimeout, clearTimeout, setImmediate, clearImmediate) {',
                postFooter: '}',
                sourcemap: 'inline'
            },
            write: false
        })
        const chunk = result.output[0]
        assert.ok(chunk?.type === 'chunk')
        const url = pathToFileURL(outputFile).href
        const hooks = registerHooks({
            resolve(specifier, context, nextResolve) {
                return specifier === url ? { url, shortCircuit: true } : nextResolve(specifier, context)
            },
            load(id, context, nextLoad) {
                return id === url ? { format: 'module', source: chunk.code, shortCircuit: true } : nextLoad(id, context)
            }
        })
        try {
            const { default: execute }: { default: (...args: unknown[]) => void } = await import(url)
            execute(
                {},
                require,
                {},
                {},
                (callback: () => void, delay: number | undefined) => {
                    const timer = setTimeout(() => {
                        timers.delete(timer)
                        callback()
                    }, delay)
                    timers.add(timer)
                    return timer
                },
                (timer: ReturnType<typeof setTimeout>) => {
                    timers.delete(timer)
                    clearTimeout(timer)
                },
                (callback: () => void) => {
                    const immediate = setImmediate(() => {
                        immediates.delete(immediate)
                        callback()
                    })
                    immediates.add(immediate)
                    return immediate
                },
                (immediate: ReturnType<typeof setImmediate>) => {
                    immediates.delete(immediate)
                    clearImmediate(immediate)
                }
            )
        } finally {
            hooks.deregister()
        }
    })
}

const nativeModel = `
import assert from 'node:assert/strict'
import { TaroElement, TaroNode } from 'vite-plugin-taro-runtime/runtime/mini'

// Model the native tree independently; its operation journal verifies the host's forwarding cost and order.
export const calls = []
export const reads = []
export const originalAppend = TaroNode.prototype.appendChild
export const originalRemove = TaroNode.prototype.removeChild
export const originalSetAttribute = TaroElement.prototype.setAttribute
export const originalRemoveAttribute = TaroElement.prototype.removeAttribute
class NativeNode {
    // Mutable native relationships belong to this test model, not to the production adapter.
    #children = []
    #value
    // Native attribute storage belongs to the recording model; the host only issues individual writes.
    attributes = Object.create(null)
    parentNode = null
    constructor(name, value) {
        this.name = name
        this.nodeType = name === '#text' ? 3 : 1
        this.#value = value
        // Record writes at the SDK boundary; SDK style parsing is outside this operation-count model.
        const node = this
        this.style = new Proxy({
            setProperty(name, value) { calls.push(['styleProperty', node, name, value]) }
        }, {
            set(target, name, value) {
                calls.push(['style', node, name, value])
                return Reflect.set(target, name, value)
            }
        })
    }
    get childNodes() { reads.push(this); return this.#children }
    get firstChild() { return this.#children[0] ?? null }
    get nextSibling() {
        return this.parentNode?.#children[this.parentNode.#children.indexOf(this) + 1] ?? null
    }
    get nodeValue() { return this.#value }
    set nodeValue(value) { calls.push(['text', this, value]); this.#value = value }
    setAttribute(name, value) {
        calls.push(['attribute', this, name, value])
        this.attributes[name] = value
    }
    removeAttribute(name) {
        calls.push(['removeAttribute', this, name])
        delete this.attributes[name]
    }
    appendChild(child) {
        assert.equal(child.parentNode, null)
        calls.push(['append', this, child])
        this.#children.push(child)
        child.parentNode = this
    }
    insertBefore(child, before) {
        assert.equal(child.parentNode, null)
        const index = this.#children.indexOf(before)
        assert.ok(index >= 0)
        calls.push(['insert', this, child, before])
        this.#children.splice(index, 0, child)
        child.parentNode = this
    }
    removeChild(child) {
        assert.strictEqual(child.parentNode, this)
        calls.push(['remove', this, child])
        this.#children.splice(this.#children.indexOf(child), 1)
        child.parentNode = null
    }
}
export const nativeDocument = {
    createElement(type) {
        const node = new NativeNode(type, '')
        calls.push(['element', type, node])
        return node
    },
    createTextNode(text) {
        const node = new NativeNode('#text', text)
        calls.push(['createText', text, node])
        return node
    }
}
export default createDomHost(nativeDocument)
`

const fixture = `
import assert from 'node:assert/strict'
import React from 'react'
import ReactDOM from 'vite-plugin-taro-runtime/react'
import { hooks } from '@tarojs/shared'
import { document, FormElement, Style, TaroElement, TaroNode, TaroText } from 'vite-plugin-taro-runtime/runtime/mini'
import host, { calls, reads, nativeDocument, originalAppend, originalRemove, originalSetAttribute, originalRemoveAttribute } from 'test:tt-dom-host'

function expectCalls(expected) {
    assert.deepEqual(calls.splice(0), expected)
    assert.deepEqual(reads.splice(0), [], 'forwarding must not read native child lists')
}
function expectChildren(parent, children) {
    assert.deepEqual(parent.childNodes, children)
    assert.deepEqual(parent.nativeNode.childNodes, children.map(child => child.nativeNode))
    for (const child of children) {
        assert.strictEqual(child.parentNode, parent)
        assert.strictEqual(child.nativeNode.parentNode, parent.nativeNode)
    }
    reads.length = 0
}
assert.deepEqual(calls, [], 'host installation does not construct a native App or document tree')
assert.strictEqual(TaroNode.prototype.appendChild, originalAppend)
assert.strictEqual(TaroNode.prototype.removeChild, originalRemove)
assert.strictEqual(TaroElement.prototype.setAttribute, originalSetAttribute)
assert.strictEqual(TaroElement.prototype.removeAttribute, originalRemoveAttribute)
const root = document.createElement('root')
assert.equal(root.nativeNode, undefined)
assert.equal(document.getElementById('app').nativeNode, undefined)
expectCalls([])
const parent = host.createElement(root, {}, 'View')
assert.ok(parent instanceof TaroElement)
expectCalls([['element', 'view', parent.nativeNode]])
const text = host.createText(root, {}, 'first')
assert.ok(text instanceof TaroText)
expectCalls([['createText', 'first', text.nativeNode]])
const input = document.createElement('input')
assert.ok(input instanceof FormElement)
assert.equal(host.isFormElement(input), true)
assert.equal(host.isFormElement(parent), false)
expectCalls([['element', 'input', input.nativeNode]])

// Tree, text, style and attribute mutations reach native operations before template payload work.
TaroNode.extend('_path', { get() { assert.fail('Native mutations must not calculate template paths') } })
TaroNode.extend('enqueueUpdate', () => assert.fail('Native mutations must not enqueue template updates'))
parent.appendChild(text)
expectCalls([['append', parent.nativeNode, text.nativeNode]])
expectChildren(parent, [text])
for (const property of ['nodeValue', 'data', 'textContent']) {
    text[property] = property
    assert.equal(text.textContent, property)
    expectCalls([['text', text.nativeNode, property]])
}
const a = document.createElement('view')
const b = document.createElement('view')
const other = document.createElement('view')
calls.length = 0
parent.insertBefore(a, text)
expectCalls([['insert', parent.nativeNode, a.nativeNode, text.nativeNode]])
parent.appendChild(b)
expectCalls([['append', parent.nativeNode, b.nativeNode]])
const retained = a.nativeNode
parent.insertBefore(b, a)
expectCalls([['remove', parent.nativeNode, b.nativeNode], ['insert', parent.nativeNode, b.nativeNode, a.nativeNode]])
expectChildren(parent, [b, a, text])
other.appendChild(a)
expectCalls([['remove', parent.nativeNode, a.nativeNode], ['append', other.nativeNode, a.nativeNode]])
parent.replaceChild(a, b)
expectCalls([
    ['remove', other.nativeNode, a.nativeNode],
    ['insert', parent.nativeNode, a.nativeNode, b.nativeNode],
    ['remove', parent.nativeNode, b.nativeNode]
])
expectChildren(parent, [a, text])
assert.strictEqual(a.nativeNode, retained)
parent.removeChild(a, { doUpdate: false })
expectCalls([['remove', parent.nativeNode, a.nativeNode]])
parent.appendChild(a)
expectCalls([['append', parent.nativeNode, retained]])
assert.strictEqual(a.nativeNode, retained)

parent.textContent = 'replacement'
const replacement = parent.firstChild
assert.ok(replacement instanceof TaroText)
expectCalls([
    ['remove', parent.nativeNode, text.nativeNode],
    ['remove', parent.nativeNode, retained],
    ['createText', 'replacement', replacement.nativeNode],
    ['append', parent.nativeNode, replacement.nativeNode]
])
expectChildren(parent, [replacement])
parent.textContent = ''
expectCalls([['remove', parent.nativeNode, replacement.nativeNode]])
expectChildren(parent, [])
host.afterCommit(parent)
expectCalls([])

// A Page lifecycle supplies its native container before rooted attribute and style updates.
root.nativeNode = nativeDocument.createElement('page')
root.appendChild(parent)
expectCalls([['element', 'page', root.nativeNode], ['append', root.nativeNode, parent.nativeNode]])
assert.strictEqual(parent._root, root)

// Taro owns logical props, dataset and the ID index; forwarding preserves values and normalizes native names.
const props = parent.props
const objectValue = { nested: ['retained'] }
for (const [name, nativeName, value] of [
    ['title', 'title', 'label'],
    ['hidden', 'hidden', false],
    ['tab-index', 'tabIndex', 0],
    ['hover-class', 'hoverClass', 'pressed'],
    ['data-entry-key', 'data-entry-key', objectValue],
    ['aria-label', 'aria-label', 'description'],
    ['custom-value', 'customValue', objectValue]
]) {
    parent.setAttribute(name, value)
    expectCalls([['attribute', parent.nativeNode, nativeName, value]])
    assert.strictEqual(parent.props[name], value)
    assert.strictEqual(parent.nativeNode.attributes[nativeName], value)
    parent.setAttribute(name, value)
    expectCalls([['attribute', parent.nativeNode, nativeName, value]])
    parent.removeAttribute(name)
    expectCalls([['removeAttribute', parent.nativeNode, nativeName]])
    assert.equal(Object.hasOwn(parent.props, name), false)
    assert.equal(Object.hasOwn(parent.nativeNode.attributes, nativeName), false)
    parent.removeAttribute(name)
    expectCalls([])
}
assert.strictEqual(parent.props, props)
const dataset = parent.dataset
parent.setAttribute('data-entry-key', objectValue)
assert.strictEqual(parent.dataset, dataset)
assert.strictEqual(dataset.entryKey, objectValue)
expectCalls([['attribute', parent.nativeNode, 'data-entry-key', objectValue]])
parent.setAttribute('id', 123)
expectCalls([['attribute', parent.nativeNode, 'id', '123']])
assert.equal(parent.uid, '123')
assert.strictEqual(document.getElementById('123'), parent)
assert.strictEqual(document.getElementById(parent.sid), parent)
parent.id = 'native-view'
expectCalls([['attribute', parent.nativeNode, 'id', 'native-view']])
assert.equal(document.getElementById('123'), null)
assert.strictEqual(document.getElementById('native-view'), parent)
parent.removeAttribute('id')
expectCalls([['removeAttribute', parent.nativeNode, 'id']])
assert.equal(parent.id, '')
assert.strictEqual(document.getElementById(parent.sid), parent)
parent.className = 'first'
expectCalls([['attribute', parent.nativeNode, 'class', 'first']])
parent.classList.add('second')
expectCalls([['attribute', parent.nativeNode, 'class', 'first second']])
assert.equal(parent.className, 'first second')
parent.removeAttribute('class')
expectCalls([['removeAttribute', parent.nativeNode, 'class']])
parent.removeAttribute('missing')
expectCalls([])

// The existing removal hook can retain a logical attribute before the host is notified.
parent.setAttribute('retained', objectValue)
expectCalls([['attribute', parent.nativeNode, 'retained', objectValue]])
hooks.tap('onRemoveAttribute', (node, name) => node === parent && name === 'retained')
parent.removeAttribute('retained')
expectCalls([])
assert.strictEqual(parent.props.retained, objectValue)
assert.strictEqual(parent.nativeNode.attributes.retained, objectValue)
input.type = 'number'
input.value = '42'
input.focus()
input.blur()
expectCalls([
    ['attribute', input.nativeNode, 'type', 'number'],
    ['attribute', input.nativeNode, 'value', '42'],
    ['attribute', input.nativeNode, 'focus', true],
    ['attribute', input.nativeNode, 'focus', false]
])
assert.equal(input.type, 'number')
assert.equal(input.value, '42')

// Single-property forwarding reads no additional cssText beyond Taro's existing mutation oldValue.
const style = parent.style
const cssText = Object.getOwnPropertyDescriptor(Style.prototype, 'cssText')
let cssReads = 0
Object.defineProperty(style, 'cssText', {
    get() { cssReads++; return cssText.get.call(this) },
    set(value) { cssText.set.call(this, value) }
})
function expectStyle(calls) {
    expectCalls(calls)
    assert.equal(cssReads, 1, 'only Taro mutation recording reads the previous cssText')
    cssReads = 0
}
style.color = 'red'
expectStyle([['style', parent.nativeNode, 'color', 'red']])
style.color = 'red'
expectCalls([])
assert.equal(cssReads, 0)
style.setProperty('margin-top', '2px')
expectStyle([['style', parent.nativeNode, 'marginTop', '2px']])
style.opacity = 0
expectStyle([['style', parent.nativeNode, 'opacity', 0]])
style.setProperty('--accent', 'blue')
expectStyle([['styleProperty', parent.nativeNode, '--accent', 'blue']])
style.setProperty('-webkit-line-clamp', '2')
expectStyle([['styleProperty', parent.nativeNode, '-webkit-line-clamp', '2']])
style['-webkit-line-clamp'] = ''
expectStyle([['styleProperty', parent.nativeNode, '-webkit-line-clamp', '']])
assert.equal(style.removeProperty('--accent'), 'blue')
expectStyle([['styleProperty', parent.nativeNode, '--accent', '']])
assert.equal(style.removeProperty('margin-top'), '2px')
expectStyle([['style', parent.nativeNode, 'marginTop', '']])
style.color = null
expectStyle([['style', parent.nativeNode, 'color', '']])
style.opacity = ''
expectStyle([['style', parent.nativeNode, 'opacity', '']])
style.removeProperty('margin-top')
expectCalls([])
assert.equal(cssReads, 0)
for (const value of ['color: green; --accent: teal;', '', null, undefined]) {
    style.cssText = value
    expectCalls([['style', parent.nativeNode, 'cssText', value || '']])
    assert.equal(cssReads, 2, 'bulk replacement reads the old mutation value and the completed style once each')
    cssReads = 0
}

// Attribute-form style operations use the Style delegate exactly once, including repeated clears.
parent.setAttribute('style', ' color: navy; margin-top: 4px ')
expectCalls([['style', parent.nativeNode, 'cssText', 'color: navy; margin-top: 4px;']])
assert.equal(parent.getAttribute('style'), 'color: navy; margin-top: 4px;')
parent.removeAttribute('style')
expectCalls([['style', parent.nativeNode, 'cssText', '']])
parent.removeAttribute('style')
expectCalls([['style', parent.nativeNode, 'cssText', '']])

// A real shared React renderer keeps Taro refs and keyed native identities through text updates and moves.
const container = document.createElement('view')
const reactRoot = ReactDOM.createRoot(container)
const ref = React.createRef()
function List({ reverse, label, style, attributes }) {
    const children = [
        React.createElement('view', { key: 'a', ref, style, ...attributes }, label),
        React.createElement('view', { key: 'b' }, 'b')
    ]
    return reverse ? children.reverse() : children
}
try {
    ReactDOM.flushSync(() => reactRoot.render(React.createElement(List, { reverse: false, label: 'a' })))
    const first = ref.current
    const firstNative = first.nativeNode
    const firstText = first.firstChild
    const second = container.lastChild
    assert.ok(first instanceof TaroElement)
    assert.notStrictEqual(first, firstNative)
    expectChildren(container, [first, second])
    calls.length = 0
    ReactDOM.flushSync(() => reactRoot.render(React.createElement(List, { reverse: true, label: 'updated' })))
    assert.strictEqual(ref.current, first)
    assert.strictEqual(first.nativeNode, firstNative)
    assert.strictEqual(first.firstChild, firstText)
    assert.equal(firstText.nativeNode.nodeValue, 'updated')
    assert.equal(calls.filter(call => call[0] === 'element' || call[0] === 'createText').length, 0)
    assert.equal(calls.filter(call => call[0] === 'text').length, 1)
    assert.equal(calls.filter(call => call[0] === 'remove').length, 1)
    assert.equal(calls.filter(call => call[0] === 'append' || call[0] === 'insert').length, 1)
    assert.deepEqual(reads, [])
    expectChildren(container, [second, first])
    calls.length = 0
    ReactDOM.flushSync(() => reactRoot.render(React.createElement(List, {
        reverse: true, label: 'updated', style: { color: 'red', marginTop: 8, opacity: 0, '--accent': 'blue' }
    })))
    expectCalls([
        ['style', firstNative, 'color', 'red'],
        ['style', firstNative, 'marginTop', '8px'],
        ['style', firstNative, 'opacity', 0],
        ['styleProperty', firstNative, '--accent', 'blue']
    ])
    ReactDOM.flushSync(() => reactRoot.render(React.createElement(List, {
        reverse: true, label: 'updated', style: { color: 'green', marginTop: 8, opacity: 0, '--accent': 'blue' }
    })))
    expectCalls([['style', firstNative, 'color', 'green']])
    ReactDOM.flushSync(() => reactRoot.render(React.createElement(List, {
        reverse: true, label: 'updated', style: { marginTop: 8, opacity: 0 }
    })))
    expectCalls([['style', firstNative, 'color', ''], ['styleProperty', firstNative, '--accent', '']])
    ReactDOM.flushSync(() => reactRoot.render(React.createElement(List, {
        reverse: true, label: 'updated', style: 'color: purple;'
    })))
    expectCalls([['style', firstNative, 'cssText', 'color: purple;']])
    ReactDOM.flushSync(() => reactRoot.render(React.createElement(List, {
        reverse: true, label: 'updated', style: { color: 'orange' }
    })))
    expectCalls([['style', firstNative, 'cssText', ''], ['style', firstNative, 'color', 'orange']])
    const attributes = { id: 'react-view', className: 'item', 'hover-class': 'pressed', 'data-entry-key': objectValue }
    ReactDOM.flushSync(() => reactRoot.render(React.createElement(List, {
        reverse: true, label: 'updated', style: { color: 'orange' }, attributes
    })))
    expectCalls([
        ['attribute', firstNative, 'id', 'react-view'],
        ['attribute', firstNative, 'class', 'item'],
        ['attribute', firstNative, 'hoverClass', 'pressed'],
        ['attribute', firstNative, 'data-entry-key', objectValue]
    ])
    assert.strictEqual(document.getElementById('react-view'), first)
    assert.strictEqual(first.dataset.entryKey, objectValue)
    ReactDOM.flushSync(() => reactRoot.render(React.createElement(List, {
        reverse: true, label: 'updated', style: { color: 'orange' }, attributes
    })))
    expectCalls([])
    ReactDOM.flushSync(() => reactRoot.render(React.createElement(List, {
        reverse: true, label: 'updated', style: { color: 'orange' }, attributes: { id: 'react-next' }
    })))
    expectCalls([
        ['removeAttribute', firstNative, 'class'],
        ['removeAttribute', firstNative, 'hoverClass'],
        ['removeAttribute', firstNative, 'data-entry-key'],
        ['attribute', firstNative, 'id', 'react-next']
    ])
    assert.equal(document.getElementById('react-view'), null)
    assert.strictEqual(document.getElementById('react-next'), first)
    assert.strictEqual(ref.current, first)
    assert.strictEqual(first.nativeNode, firstNative)
} finally {
    calls.length = 0
    ReactDOM.flushSync(() => reactRoot.unmount())
}
assert.equal(calls.length, 2)
assert.ok(calls.every(call => call[0] === 'remove'))
expectChildren(container, [])
assert.equal(ref.current, null)
`
