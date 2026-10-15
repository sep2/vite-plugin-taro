import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'rolldown'
import { normalizePath, resolveConfig } from 'vite'
import vpt from '../../index.ts'
import { rendererHostId } from '../../node/plugins/mini/module/module.ts'
import { createTtMiniContract } from '../../node/plugins/tt/plugins.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../node/utils/packages.ts'

const require = createRequire(import.meta.url)

for (const mode of ['development', 'production'] as const) {
    test(`TT renderer (${mode}): installs one host for the startup SDK capabilities`, async (t) => {
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
        const contract = createTtMiniContract({
            target: 'tt',
            renderer: 'dom',
            app: 'src/app.tsx',
            pages: [],
            appJson: {},
            projectConfigJson: {}
        })
        const config = await resolveConfig({ configFile: false, plugins: vpt(contract.options) }, 'build')
        const entry = 'test:tt-dom-host-fixture'
        const hostModule = 'test:tt-dom-host'
        const modelModule = 'test:tt-native-document'
        const outputFile = fileURLToPath(new URL(`./tt-dom-host-${mode}-fixture.js`, import.meta.url))
        const runtimeRoot = normalizePath(fileURLToPath(new URL('../', import.meta.url)))
        const result = await build({
            input: entry,
            platform: 'node',
            plugins: [
                {
                    name: entry,
                    resolveId(id) {
                        if (id === entry || id === hostModule || id === modelModule) {
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
                            return `${fixture}\n${eventsFixture}\n${pagesFixture}\n}\n${templateFixture}`
                        }
                        if (id === hostModule) {
                            // The SDK exists before the selected application host initializes; do not replace that host.
                            return `import '${modelModule}';
                                export * from '${modelModule}';
                                export { default } from ${JSON.stringify(contract.taro.hostPath)};`
                        }
                        if (id === modelModule) {
                            return nativeModel
                        }
                    },
                    transform(code, id) {
                        if (!normalizePath(id).startsWith(runtimeRoot)) {
                            return { code, map: { version: 3, sources: [], names: [], mappings: '' } }
                        }
                    }
                }
            ],
            transform: {
                define: { ...config.define, 'process.env.NODE_ENV': JSON.stringify(mode), 'import.meta.hot': 'false' }
            },
            output: {
                file: outputFile,
                format: 'cjs',
                postBanner:
                    'export default function(exports, require, globalThis, global, setTimeout, clearTimeout, setImmediate, clearImmediate, tt, getCurrentPages) {',
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
            const executeFixture = (sdk: {
                nativeAvailable: boolean
                expectDom: boolean
                getRenderMode?: () => number
                pages?: unknown[]
            }) => {
                const exports: { completion?: Promise<void> } = {}
                execute(
                    exports,
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
                    },
                    sdk,
                    () => sdk.pages ?? []
                )
                return exports
            }
            // Reuse one bundle across capability cases so coverage describes the same startup decision.
            for (const sdk of [
                { nativeAvailable: true, getRenderMode: () => 2, expectDom: true },
                { nativeAvailable: true, getRenderMode: () => 1, expectDom: false },
                { nativeAvailable: true, expectDom: false },
                { nativeAvailable: false, getRenderMode: () => 2, expectDom: false }
            ]) {
                const exports = executeFixture(sdk)
                assert.ok(exports.completion)
                await exports.completion
            }
        } finally {
            hooks.deregister()
        }
    })
}

const nativeModel = `
import assert from 'node:assert/strict'
import { document, TaroElement, TaroNode, TaroRootElement } from 'vite-plugin-taro-runtime/runtime/mini'

// Capture the shared logical implementation before either host installs its presentation policy.
export const original = {
    createElement: document.createElement,
    createTextNode: document.createTextNode,
    nodeEnqueue: TaroNode.prototype.enqueueUpdate,
    childInsertion: TaroNode.prototype.delegateChildInsertion,
    rootEnqueue: TaroRootElement.prototype.enqueueUpdate,
    rootPerform: TaroRootElement.prototype.performUpdate,
    rootPath: Object.getOwnPropertyDescriptor(TaroRootElement.prototype, '_path').get
}

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
    // The SDK owns its listener collections; this model records the same registration boundary.
    listeners = new Map()
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
    addEventListener(name, listener) {
        calls.push(['listen', this, name, listener])
        if (!this.listeners.has(name)) {
            this.listeners.set(name, new Set())
        }
        this.listeners.get(name).add(listener)
    }
    removeEventListener(name, listener) {
        calls.push(['unlisten', this, name, listener])
        this.listeners.get(name)?.delete(listener)
    }
    emit(name, event) {
        let result
        for (const listener of [...(this.listeners.get(name) ?? [])]) {
            result = listener.call(this, event)
        }
        return result
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
// Platform-owned Page registration exists only in this SDK model, not in the production host.
export const pageDocuments = new Map()
// Freezing the SDK facade makes factory replacement or synthetic document setup fail immediately.
export const nativeDocument = Object.freeze({
    getPageDocumentById(id) {
        calls.push(['pageDocument', id])
        return pageDocuments.get(id)
    },
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
})
if (tt.nativeAvailable) {
    tt.appDocument = nativeDocument
}
`

const fixture = `
import assert from 'node:assert/strict'
import React from 'react'
import ReactDOM from 'vite-plugin-taro-runtime/react'
import { hooks, isEnableTTDom, toCamelCase } from '@tarojs/shared'
import 'vite-plugin-taro-runtime/plugin-platform-tt/runtime'
import { Current, document, eventHandler, FormElement, Style, TaroElement, TaroNode, TaroRootElement, TaroText } from 'vite-plugin-taro-runtime/runtime/mini'
import { useLoad, useUnload } from 'vite-plugin-taro-runtime/plugin-framework-react/runtime'
import { createVptApp } from ${JSON.stringify(resolveVptRuntime('mini/vpt/create-vpt-app'))}
import { createVptPage } from ${JSON.stringify(resolveVptRuntime('mini/vpt/create-vpt-page'))}
import host, { calls, reads, nativeDocument, pageDocuments, original, originalAppend, originalRemove, originalSetAttribute, originalRemoveAttribute } from 'test:tt-dom-host'

export const completion = tt.expectDom ? checkDom() : checkTemplate()

async function checkDom() {
assert.strictEqual(Object.getOwnPropertyDescriptor(TaroRootElement.prototype, '_path').get, original.rootPath,
    'importing the template factory must not install its namespace policy')
assert.strictEqual(TaroNode.prototype.enqueueUpdate, original.nodeEnqueue)
// The selected native document remains authoritative even if capability properties later change.
tt.getRenderMode = () => 1
tt.appDocument = undefined

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
assert.equal(isEnableTTDom(), false, 'the shared renderer continues to use Taro logical nodes')
assert.notStrictEqual(document, nativeDocument)
assert.deepEqual(calls, [], 'host installation does not construct a native App or document tree')
assert.strictEqual(TaroNode.prototype.appendChild, originalAppend)
assert.strictEqual(TaroNode.prototype.removeChild, originalRemove)
assert.strictEqual(TaroElement.prototype.setAttribute, originalSetAttribute)
assert.strictEqual(TaroElement.prototype.removeAttribute, originalRemoveAttribute)
const root = document.createElement('root')
assert.equal(root.nativeNode.name, 'view')
assert.equal(root.nativeNode.parentNode, null)
assert.equal(document.getElementById('app').nativeNode, undefined)
expectCalls([['element', 'view', root.nativeNode]])
const insertion = root.delegateChildInsertion
const removal = root.delegateChildRemoval
const detachedOutlet = host.createElement(root, {}, 'vpt_page_outlet')
assert.equal(detachedOutlet.nativeNode, undefined)
assert.strictEqual(root.delegateChildInsertion, insertion, 'creating an outlet must not configure another node')
assert.strictEqual(root.delegateChildRemoval, removal)
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
expectCalls([
    ['element', 'input', input.nativeNode],
    ['listen', input.nativeNode, 'bindinput', input.nativeEventListener]
])

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

// A Page root owns its offline native element before lifecycle binding; rooted mutations use the same handle.
const rootNative = root.nativeNode
root.appendChild(parent)
expectCalls([['append', rootNative, parent.nativeNode]])
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

const eventsFixture = `
// Native events carry platform targets and payloads; the bridge receives the SDK wrapper around them.
function nativeTarget(node) {
    return {
        id: node.nativeNode.attributes.id ?? '',
        dataset: Object.fromEntries(Object.entries(node.nativeNode.attributes)
            .filter(([name]) => name.startsWith('data-'))
            .map(([name, value]) => [toCamelCase(name.slice(5)), value]))
    }
}
function emitNative(node, type, detail, target) {
    const data = { type, detail, target: nativeTarget(target), currentTarget: nativeTarget(node) }
    const name = (type === 'touchmove' && node.props.catchMove ? 'catch' : 'bind') + type
    return node.nativeNode.emit(name, { _rawEvent: { data } })
}
function eventNode(name) {
    const node = document.createElement(name)
    calls.length = 0
    return node
}
// Match the framework's existing React batching integration; no VPT event queue participates.
hooks.tap('batchedEventUpdates', callback => ReactDOM.unstable_batchedUpdates(callback))
const events = []
const eventView = eventNode('view')
assert.equal(eventView.nativeEventListener, undefined)
// Subscription decisions must use the original handler array lengths, not enumerate event names.
eventView.__handlers = new Proxy(eventView.__handlers, {
    ownKeys() { assert.fail('Native subscription decisions must not scan event names') }
})
function firstListener(event) {
    assert.strictEqual(this, eventView)
    assert.equal(event.bubbles, true)
    assert.equal(event.cancelable, true)
    events.push('first')
}
function secondListener() { events.push('second') }
eventView.addEventListener('TaP', firstListener)
const bridge = eventView.nativeEventListener
expectCalls([['listen', eventView.nativeNode, 'bindtap', bridge]])
eventView.addEventListener('tap', secondListener)
expectCalls([])
emitNative(eventView, 'tap', {}, eventView)
assert.deepEqual(events.splice(0), ['second', 'first'])
eventView.removeEventListener('tap', firstListener)
eventView.removeEventListener('tap', () => {})
expectCalls([])
eventView.removeEventListener('TAP', secondListener)
expectCalls([['unlisten', eventView.nativeNode, 'bindtap', bridge]])
emitNative(eventView, 'tap', {}, eventView)
assert.deepEqual(events, [])
eventView.addEventListener('tap', firstListener, { once: true })
expectCalls([['listen', eventView.nativeNode, 'bindtap', bridge]])
emitNative(eventView, 'tap', {}, eventView)
assert.deepEqual(events.splice(0), ['first'])
expectCalls([['unlisten', eventView.nativeNode, 'bindtap', bridge]])
eventView.addEventListener('scroll', firstListener)
expectCalls([['listen', eventView.nativeNode, 'bindscroll', bridge]])
eventView.removeEventListener('scroll', firstListener)
expectCalls([['unlisten', eventView.nativeNode, 'bindscroll', bridge]])
assert.strictEqual(eventView.nativeEventListener, bridge)

const map = eventNode('map')
function regionListener(event) { events.push(event.type) }
map.addEventListener('regionchange', regionListener)
const mapBridge = map.nativeEventListener
expectCalls([['listen', map.nativeNode, 'bindregionchange', mapBridge]])
emitNative(map, 'regionchange', { type: 'begin' }, map)
emitNative(map, 'regionchange', { type: 'end' }, map)
assert.deepEqual(events.splice(0), ['begin', 'end'])
map.removeEventListener('regionchange', regionListener)
expectCalls([['unlisten', map.nativeNode, 'bindregionchange', mapBridge]])
map.addEventListener('end', regionListener)
map.addEventListener('begin', regionListener)
expectCalls([['listen', map.nativeNode, 'bindregionchange', mapBridge]])
map.removeEventListener('end', regionListener)
expectCalls([])
map.removeEventListener('begin', regionListener)
expectCalls([['unlisten', map.nativeNode, 'bindregionchange', mapBridge]])
const custom = eventNode('custom-component')
custom.addEventListener('begin', regionListener)
expectCalls([['listen', custom.nativeNode, 'bindbegin', custom.nativeEventListener]])
custom.removeEventListener('begin', regionListener)
expectCalls([['unlisten', custom.nativeNode, 'bindbegin', custom.nativeEventListener]])

const move = eventNode('view')
move.setAttribute('catchMove', false)
expectCalls([['attribute', move.nativeNode, 'catchMove', false]])
move.setAttribute('catchMove', true)
const moveBridge = move.nativeEventListener
expectCalls([
    ['attribute', move.nativeNode, 'catchMove', true],
    ['listen', move.nativeNode, 'catchtouchmove', moveBridge]
])
move.addEventListener('touchmove', regionListener)
expectCalls([])
emitNative(move, 'touchmove', {}, move)
assert.deepEqual(events.splice(0), ['touchmove'])
move.setAttribute('catchMove', false)
expectCalls([
    ['attribute', move.nativeNode, 'catchMove', false],
    ['listen', move.nativeNode, 'bindtouchmove', moveBridge],
    ['unlisten', move.nativeNode, 'catchtouchmove', moveBridge]
])
move.setAttribute('catchMove', true)
expectCalls([
    ['attribute', move.nativeNode, 'catchMove', true],
    ['unlisten', move.nativeNode, 'bindtouchmove', moveBridge],
    ['listen', move.nativeNode, 'catchtouchmove', moveBridge]
])
move.removeEventListener('touchmove', regionListener)
expectCalls([])
move.removeAttribute('catchMove')
expectCalls([
    ['removeAttribute', move.nativeNode, 'catchMove'],
    ['unlisten', move.nativeNode, 'bindtouchmove', moveBridge],
    ['unlisten', move.nativeNode, 'catchtouchmove', moveBridge]
])
const refund = eventNode('pay-button')
const returned = { accepted: true }
refund.addEventListener('applyrefund', () => returned)
assert.strictEqual(emitNative(refund, 'applyrefund', {}, refund), returned)
calls.length = 0

// Intrinsic form listeners remain active with zero application handlers and retain the shared React restore path.
const formContainer = document.createElement('view')
const formRoot = ReactDOM.createRoot(formContainer)
const controlledRef = React.createRef()
const uncontrolledRef = React.createRef()
const textareaRef = React.createRef()
function Form() {
    return React.createElement(React.Fragment, null,
        React.createElement('input', { ref: controlledRef, value: 'locked' }),
        React.createElement('input', { ref: uncontrolledRef }),
        React.createElement('textarea', { ref: textareaRef, value: 'text' }))
}
try {
    ReactDOM.flushSync(() => formRoot.render(React.createElement(Form)))
    const controlled = controlledRef.current
    const uncontrolled = uncontrolledRef.current
    const textarea = textareaRef.current
    calls.length = 0
    emitNative(controlled, 'input', { value: 'typed' }, controlled)
    assert.equal(controlled.value, 'locked')
    expectCalls([
        ['attribute', controlled.nativeNode, 'value', 'typed'],
        ['attribute', controlled.nativeNode, 'value', 'locked']
    ])
    emitNative(uncontrolled, 'input', { value: 'typed' }, uncontrolled)
    assert.equal(uncontrolled.value, 'typed')
    expectCalls([['attribute', uncontrolled.nativeNode, 'value', 'typed']])
    emitNative(textarea, 'input', { value: 'edited' }, textarea)
    assert.equal(textarea.value, 'text')
    expectCalls([
        ['attribute', textarea.nativeNode, 'value', 'edited'],
        ['attribute', textarea.nativeNode, 'value', 'text']
    ])
    // Match the value-changing events in Taro's component definitions.
    for (const [name, type, value] of [
        ['input', 'input', 'typed'],
        ['textarea', 'input', 'edited'],
        ['picker', 'change', 2],
        ['picker-view', 'change', [1]],
        ['slider', 'change', 7],
        ['switch', 'change', true]
    ]) {
        const node = document.createElement(name)
        const listener = node.nativeEventListener
        expectCalls([
            ['element', name, node.nativeNode],
            ['listen', node.nativeNode, 'bind' + type, listener]
        ])
        node.addEventListener(type, regionListener)
        node.removeEventListener(type, regionListener)
        expectCalls([])
        emitNative(node, type, { value }, node)
        assert.strictEqual(node.value, value)
        expectCalls(type === 'input' ? [['attribute', node.nativeNode, 'value', value]] : [])
        const explicitType = type === 'input' ? 'change' : 'input'
        node.addEventListener(explicitType, regionListener)
        node.removeEventListener(explicitType, regionListener)
        expectCalls([
            ['listen', node.nativeNode, 'bind' + explicitType, listener],
            ['unlisten', node.nativeNode, 'bind' + explicitType, listener]
        ])
        assert.equal(node.nativeNode.listeners.get('bind' + type).size, 1)
    }
    // Checkbox/radio do not emit individual value changes; group events are application subscriptions.
    for (const name of ['checkbox', 'radio', 'checkbox-group', 'radio-group']) {
        const node = document.createElement(name)
        expectCalls([['element', name, node.nativeNode]])
        assert.equal(node.nativeEventListener, undefined)
        node.addEventListener('change', regionListener)
        node.removeEventListener('change', regionListener)
        expectCalls([
            ['listen', node.nativeNode, 'bindchange', node.nativeEventListener],
            ['unlisten', node.nativeNode, 'bindchange', node.nativeEventListener]
        ])
        assert.equal(node.nativeNode.listeners.get('bindchange').size, 0)
    }
    const button = eventNode('button')
    button.addEventListener('input', regionListener)
    button.removeEventListener('input', regionListener)
    expectCalls([
        ['listen', button.nativeNode, 'bindinput', button.nativeEventListener],
        ['unlisten', button.nativeNode, 'bindinput', button.nativeEventListener]
    ])
} finally {
    ReactDOM.flushSync(() => formRoot.unmount())
}

const eventParent = eventNode('view')
const eventChild = eventNode('view')
eventParent.id = 'event-parent'
eventChild.id = 'event-child'
eventParent.setAttribute('data-role', 'parent')
eventChild.setAttribute('data-role', 'child')
eventParent.appendChild(eventChild)
eventParent.addEventListener('tap', event => {
    assert.equal(event.target.dataset.role, 'child')
    assert.equal(event.currentTarget.dataset.role, 'parent')
    events.push('parent')
})
eventChild.addEventListener('tap', () => events.push('child'))
calls.length = 0
emitNative(eventChild, 'tap', {}, eventChild)
assert.deepEqual(events, [], 'Taro batches child dispatch until the parent native callback')
emitNative(eventParent, 'tap', {}, eventChild)
assert.deepEqual(events.splice(0), ['child', 'parent'])
eventChild.addEventListener('tap', event => event.stopPropagation(), { once: true })
emitNative(eventChild, 'tap', {}, eventChild)
emitNative(eventParent, 'tap', {}, eventChild)
assert.deepEqual(events.splice(0), ['child'])
const childBridge = eventChild.nativeEventListener
eventParent.removeChild(eventChild)
assert.equal(document.getElementById('event-child'), null)
eventParent.appendChild(eventChild)
assert.strictEqual(eventChild.nativeEventListener, childBridge)
emitNative(eventChild, 'tap', {}, eventChild)
emitNative(eventParent, 'tap', {}, eventChild)
assert.deepEqual(events.splice(0), ['child', 'parent'], 'receiver dispatch survives Taro index cleanup')
calls.length = 0
`

const pagesFixture = `
await checkPages()
async function checkPages() {
    for (const appConfig of [{}, { appId: 'custom-dom-app' }]) {
        const lifecycle = []
        const states = new Map()
        const refs = new Map()
        const Shared = React.createContext('initial')
        function App({ children }) {
            const [value, setValue] = React.useState('initial')
            states.set('app', setValue)
            React.useLayoutEffect(() => {
                lifecycle.push('app:mount')
                return () => lifecycle.push('app:unmount')
            }, [])
            return React.createElement(Shared.Provider, { value }, children)
        }
        function makePage(id, label) {
            const native = nativeDocument.createElement('page')
            native.setAttribute('id', 'native-' + id)
            pageDocuments.set(id, native)
            const ref = React.createRef()
            refs.set(label, ref)
            function Page() {
                const [value, setValue] = React.useState(0)
                const shared = React.useContext(Shared)
                states.set(label, setValue)
                React.useLayoutEffect(() => {
                    lifecycle.push(label + ':mount')
                    assert.equal(ref.current._root.nativeNode.parentNode, null,
                        'React builds the Page native root offline')
                    return () => lifecycle.push(label + ':unmount')
                }, [])
                useLoad(() => {
                    const node = ref.current
                    assert.equal(node._root.ctx, null, 'business onLoad retains upstream ctx timing')
                    assert.equal(node._root.nativeNode.parentNode, null)
                    assert.strictEqual(node.nativeNode.parentNode, node._root.nativeNode)
                    node.setAttribute('data-loaded', true)
                    lifecycle.push(label + ':load')
                })
                useUnload(() => lifecycle.push(label + ':unload'))
                return React.createElement(React.Fragment, null,
                    React.createElement('view', { ref, id: label }, label + ':' + value + ':' + shared),
                    React.createElement('input', { defaultValue: 'seed-' + label }))
            }
            const config = createVptPage(Page, { path: 'pages/' + label, prerender: false })
            const context = { __webviewId__: id, route: 'pages/' + label,
                setData() { assert.fail('DOM must not write template data') } }
            return { config, context, native }
        }
        const first = makePage(0, 'first')
        const second = makePage(22, 'second')
        const app = createVptApp(App, appConfig)
        assert.equal(app.mount.length, 3, 'mount keeps its existing signature')
        const appRoot = document.getElementById(appConfig.appId || 'app')
        assert.equal(appRoot.childNodes.length, 0, 'App binding precedes React outlet creation')
        assert.ok(Object.hasOwn(appRoot, 'delegateChildInsertion'))
        assert.ok(Object.hasOwn(appRoot, 'delegateChildRemoval'))
        assert.equal(appRoot.ctx, null, 'DOM App binding does not install a template data sink')
        calls.length = 0
        try {
            // Both mounts enter the cold App before it commits. Binding must use each root.ctx, not Current.page.
            const firstLoaded = new Promise(resolve => first.config.onLoad.call(first.context, {}, resolve))
            const secondLoaded = new Promise(resolve => second.config.onLoad.call(second.context, {}, resolve))
            Current.page = { __webviewId__: 999 }
            await Promise.all([firstLoaded, secondLoaded])
            assert.deepEqual(calls.filter(call => call[0] === 'pageDocument').map(call => call[1]).sort((a, b) => a - b), [0, 22])
            assert.equal(lifecycle.filter(value => value === 'app:mount').length, 1)
            for (const [page, label] of [[first, 'first'], [second, 'second']]) {
                const node = refs.get(label).current
                const root = document.getElementById(page.context.$taroPath)
                assert.strictEqual(node._root, root)
                assert.strictEqual(root.ctx, page.context)
                assert.notStrictEqual(root.nativeNode, page.native)
                assert.strictEqual(root.nativeNode.parentNode, page.native)
                assert.strictEqual(node.nativeNode.parentNode, root.nativeNode)
                assert.equal(root.parentNode.nodeName, 'vpt_page_outlet')
                assert.equal(root.parentNode.nativeNode, undefined)
                assert.strictEqual(root.parentNode.parentNode, appRoot)
                assert.equal(page.native.attributes.id, 'native-' + page.context.__webviewId__)
                assert.equal(root.nativeNode.attributes.id, root.id)
                assert.equal(node.nativeNode.attributes['data-loaded'], true)
                assert.deepEqual(root.updatePayloads, [])
                assert.equal(root.pendingUpdate, false)
                assert.equal(node.nativeNode.firstChild.nodeValue, label + ':0:initial')
                assert.equal(lifecycle.filter(value => value === label + ':mount').length, 1)
                assert.deepEqual(calls.filter(call => call[0] === 'append' && call[1] === page.native),
                    [['append', page.native, root.nativeNode]], 'one native root insertion attaches the whole Page')
            }
            assert.deepEqual(reads.splice(0), [], 'mounting does not inspect native child lists')
            const firstNode = refs.get('first').current
            const secondNode = refs.get('second').current
            const firstRoot = firstNode._root
            const firstNative = firstRoot.nativeNode
            const firstInput = firstRoot.childNodes[1]
            assert.strictEqual(firstNode.nativeNode.nextSibling, firstInput.nativeNode)
            calls.length = 0
            emitNative(firstInput, 'input', { value: 'typed' }, firstInput)
            expectCalls([['attribute', firstInput.nativeNode, 'value', 'typed']])
            ReactDOM.flushSync(() => states.get('first')(1))
            expectCalls([['text', firstNode.nativeNode.firstChild, 'first:1:initial']])
            assert.equal(secondNode.nativeNode.firstChild.nodeValue, 'second:0:initial')
            ReactDOM.flushSync(() => states.get('app')('next'))
            assert.equal(calls.length, 2)
            assert.ok(calls.every(call => call[0] === 'text'))
            assert.deepEqual(calls.splice(0).map(call => call[2]).sort(), ['first:1:next', 'second:0:next'])
            assert.strictEqual(refs.get('first').current, firstNode)
            assert.strictEqual(firstRoot.nativeNode, firstNative)
            assert.strictEqual(firstNative.parentNode, first.native)
            expectCalls([])

            // Taro decomposes logical moves into remove(cleanRef:false) and insert.
            // Page order in the outlet must not detach a root from its independent native document.
            const outlet = firstRoot.parentNode
            const secondRoot = secondNode._root
            outlet.insertBefore(firstRoot, secondRoot)
            assert.strictEqual(firstNative.parentNode, first.native)
            assert.strictEqual(secondRoot.nativeNode.parentNode, second.native)
            outlet.insertBefore(secondRoot, firstRoot)
            assert.equal(firstInput.value, 'typed')
            assert.equal(firstInput.nativeNode.attributes.value, 'typed')
            assert.strictEqual(firstInput.nativeNode.parentNode, firstNative)
            expectCalls([])

            // Initial attachment and repeated completion must never enumerate logical root children.
            const children = firstRoot.childNodes
            first.native.removeChild(firstNative)
            calls.length = 0
            const callbacks = []
            Object.defineProperty(firstRoot, 'childNodes', {
                configurable: true,
                get() { assert.fail('Page attachment must not read logical childNodes') }
            })
            try {
                firstRoot.enqueueUpdate({ path: 'page.cn', value() { assert.fail('DOM must not evaluate template payloads') } })
                firstRoot.enqueueUpdateCallback(() => callbacks.push('existing'))
                firstRoot.performUpdate(true, data => {
                    assert.deepEqual(data, {})
                    callbacks.push('complete')
                })
                expectCalls([['pageDocument', 0], ['append', first.native, firstNative]])
                firstRoot.performUpdate(true)
                expectCalls([['pageDocument', 0]])
                firstRoot.performUpdate(false)
                expectCalls([])
            } finally {
                Object.defineProperty(firstRoot, 'childNodes', { value: children, writable: true, configurable: true })
            }
            assert.deepEqual(callbacks, ['existing', 'complete'])
            assert.deepEqual(firstRoot.updatePayloads, [])

            ReactDOM.flushSync(() => first.config.onUnload.call(first.context))
            expectCalls([['remove', first.native, firstNative]])
            assert.equal(firstRoot.parentNode, null)
            assert.equal(firstRoot.ctx, null)
            assert.equal(refs.get('first').current, null)
            assert.equal(firstNative.parentNode, null)
            assert.strictEqual(firstNative.firstChild, firstNode.nativeNode, 'detachment preserves native descendants')
            assert.strictEqual(firstInput.nativeNode.parentNode, firstNative)
            assert.equal(firstInput.nativeNode.attributes.value, 'typed')
            assert.strictEqual(firstRoot.nativeNode, firstNative)
            assert.equal(document.getElementById(first.context.$taroPath), null)
            assert.ok(lifecycle.indexOf('first:unload') < lifecycle.indexOf('first:unmount'))
            pageDocuments.delete(0)
            ReactDOM.flushSync(() => states.get('second')(2))
            expectCalls([['text', secondNode.nativeNode.firstChild, 'second:2:next']])
            // Model native removal preceding React cleanup; the outlet must not issue a second removal.
            second.native.removeChild(secondNode._root.nativeNode)
            pageDocuments.delete(22)
            calls.length = 0
            ReactDOM.flushSync(() => second.config.onUnload.call(second.context))
            assert.equal(refs.get('second').current, null)
            expectCalls([])

            const third = makePage(33, 'third')
            calls.length = 0
            await new Promise(resolve => {
                ReactDOM.flushSync(() => third.config.onLoad.call(third.context, {}, resolve))
            })
            const thirdRoot = refs.get('third').current._root
            assert.strictEqual(thirdRoot.nativeNode.parentNode, third.native)
            assert.equal(lifecycle.filter(value => value === 'app:mount').length, 1)
            ReactDOM.flushSync(() => third.config.onUnload.call(third.context))
            pageDocuments.delete(33)
            const missing = host.createElement(appRoot, {}, 'root')
            missing.ctx = { __webviewId__: 404 }
            assert.equal(missing.nativeNode.parentNode, null)
            assert.throws(() => missing.performUpdate(true), /TT Page document not found: 404/)
        } finally {
            ReactDOM.flushSync(() => ReactDOM.unmountComponentAtNode(appRoot))
            assert.equal(lifecycle.filter(value => value === 'app:unmount').length, 1)
        }
    }
}
`

const templateFixture = `
async function checkTemplate() {
    assert.strictEqual(document.createElement, original.createElement)
    assert.strictEqual(document.createTextNode, original.createTextNode)
    assert.strictEqual(TaroNode.prototype.delegateChildInsertion, original.childInsertion)
    assert.strictEqual(TaroRootElement.prototype.enqueueUpdate, original.rootEnqueue)
    assert.strictEqual(TaroRootElement.prototype.performUpdate, original.rootPerform)
    assert.notStrictEqual(TaroNode.prototype.enqueueUpdate, original.nodeEnqueue)
    assert.equal(document.getElementById('app')._path, 'app')
    assert.equal(document.createElement('root')._path, 'page')
    assert.deepEqual(calls, [], 'fallback must not construct or bind native nodes')

    // Capability changes after startup must not replace the installed host.
    tt.getRenderMode = () => 2
    tt.appDocument = nativeDocument
    const writes = []
    const lifecycle = []
    const refs = [React.createRef(), React.createRef()]
    const inputs = [React.createRef(), React.createRef()]
    const states = {}
    const Shared = React.createContext('initial')
    function App({ children }) {
        const [value, setValue] = React.useState('initial')
        states.app = setValue
        React.useLayoutEffect(() => { lifecycle.push('app:mount') }, [])
        return React.createElement(Shared.Provider, { value },
            React.createElement('view', { className: 'layout-' + value }, children))
    }
    const loaded = [Promise.withResolvers(), Promise.withResolvers()]
    const contexts = [0, 1].map(index => ({
        __webviewId__: index,
        setData(data, complete) {
            writes.push({ index, data })
            complete?.()
            if (Object.keys(data).some(path => path.startsWith('page.cn'))) {
                loaded[index].resolve()
            }
        }
    }))
    tt.pages = contexts
    const configs = contexts.map((_, index) => {
        function Page() {
            const [value, setValue] = React.useState(0)
            const shared = React.useContext(Shared)
            states[index] = setValue
            React.useLayoutEffect(() => { lifecycle.push('page:' + index) }, [])
            return React.createElement('view', { ref: refs[index] },
                React.createElement('text', null, index + ':' + value + ':' + shared),
                React.createElement('input', { ref: inputs[index], value: 'locked' }))
        }
        return createVptPage(Page, { path: 'pages/fallback-' + index, prerender: false })
    })
    createVptApp(App, {})
    const appRoot = document.getElementById('app')
    const flushData = () => new Promise(resolve => setTimeout(resolve, 0))
    try {
        // The third onLoad argument is Taro's prerender sink; normal rendering completes through native setData.
        configs.forEach((config, index) => config.onLoad.call(contexts[index], {}))
        await Promise.all(loaded.map(load => load.promise))
        assert.equal(lifecycle.filter(value => value === 'app:mount').length, 1)
        for (const index of [0, 1]) {
            const node = refs[index].current
            assert.ok(node instanceof TaroElement)
            assert.equal(node.nativeNode, undefined)
            assert.equal(node._root.nativeNode, undefined)
            assert.equal(node._root._path, 'page')
            assert.strictEqual(node._root.ctx, contexts[index])
            assert.equal(node.textContent, index + ':0:initial')
            assert.ok(writes.some(write => write.index === index &&
                Object.hasOwn(write.data, 'app.cn') &&
                Object.keys(write.data).some(path => path.startsWith('page.cn'))),
                'the native initial batch contains both App layout and Page data')
            assert.equal(lifecycle.filter(value => value === 'page:' + index).length, 1)
        }
        const first = refs[0].current
        const second = refs[1].current
        writes.length = 0
        ReactDOM.flushSync(() => states[0](1))
        await flushData()
        assert.ok(writes.length > 0)
        assert.ok(writes.every(write => write.index === 0))
        assert.equal(first.textContent, '0:1:initial')
        assert.equal(second.textContent, '1:0:initial')

        writes.length = 0
        ReactDOM.flushSync(() => states.app('next'))
        await flushData()
        for (const index of [0, 1]) {
            assert.ok(writes.some(write => write.index === index &&
                Object.keys(write.data).some(path => path.startsWith('app.cn'))))
        }
        assert.equal(first.textContent, '0:1:next')
        assert.equal(second.textContent, '1:0:next')
        assert.strictEqual(refs[0].current, first)
        assert.strictEqual(refs[1].current, second)

        const input = inputs[0].current
        const target = { id: input.sid, dataset: { sid: input.sid } }
        eventHandler({ type: 'input', detail: { value: 'typed' }, target, currentTarget: target })
        assert.equal(input.value, 'locked', 'fallback retains shared controlled-input restoration')
        await flushData()

        ReactDOM.flushSync(() => configs[0].onUnload.call(contexts[0]))
        assert.equal(refs[0].current, null)
        assert.strictEqual(refs[1].current, second)
        assert.equal(document.getElementById(contexts[0].$taroPath), null)
        ReactDOM.flushSync(() => states[1](2))
        await flushData()
        assert.equal(second.textContent, '1:2:next')
        assert.deepEqual(calls, [], 'template updates never touch SDK DOM operations')
    } finally {
        for (const index of [0, 1]) {
            if (refs[index].current) {
                ReactDOM.flushSync(() => configs[index].onUnload.call(contexts[index]))
            }
        }
        tt.pages = []
        appRoot.remove()
        ReactDOM.flushSync(() => ReactDOM.unmountComponentAtNode(appRoot))
    }
}
`
