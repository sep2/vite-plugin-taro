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
    test(`WX style batching (${mode}): React updates preserve logical styles and flush native CSS once`, async () => {
        const config = await resolveConfig(
            {
                configFile: false,
                plugins: vpt({ target: 'wx', app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
            },
            'build'
        )
        const renderer = resolveTaroRuntime('react')
        const entry = 'test:wx-style-batching'
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
                assert.fail('Style updates must be synchronous and must not schedule template work')
            },
            clearTimeout() {
                assert.fail('Style updates must not own timers')
            }
        })
    })
}

const fixture = `
import assert from 'node:assert/strict'
import { Current, document, MutationObserver, Style } from 'vite-plugin-taro-runtime/runtime/mini'
import 'vite-plugin-taro-runtime/plugin-platform-weapp/runtime'
import { hostConfig } from 'vite-plugin-taro-runtime/react'
import host from '\\0vpt:renderer-host'

const app = Current.app = { mount() {}, unmount() {} }
host.bindApp(app, document.createElement('root'))
const nativePage = { root: globalThis.sdk }
host.createPage(() => null, { path: 'page', prerender: false }).lifetimes.attached.call(nativePage)
const context = host.getChildHostContext({}, host.getPageRootType(nativePage.$taroPath))
function element(type) { return host.createElement(null, context, type) }

// React props and native clone construction keep declarations lazy until the first style update.
{
    const node = element('view')
    const props = { id: 'unstyled-wx', className: 'layout', title: 'label' }
    hostConfig.finalizeInitialChildren(node, 'view', props)
    const clone = node.cloneNode(true)
    for (const element of [node, clone]) {
        assert.equal(element.cssText, '')
        assert.equal(element.getAttribute('style'), '')
        assert.equal(element.attributes.some(attribute => attribute.name === 'style'), false)
        assert.equal(Object.values(element).some(value => value instanceof Style), false)
        assert.equal(element.nativeNode.style, '')
    }
    hostConfig.commitUpdate(node, 'view', props, { ...props, style: { color: 'teal', width: 3 } })
    assert.equal(Object.values(node).filter(value => value instanceof Style).length, 1)
    assert.equal(node.nativeNode.style, 'color: teal; width: 3px;')
    const styledClone = node.cloneNode(true)
    assert.notStrictEqual(styledClone.style, node.style)
    assert.equal(styledClone.nativeNode.style, node.nativeNode.style)
    styledClone.style.color = 'gold'
    assert.equal(styledClone.nativeNode.style, 'color: gold; width: 3px;')
    assert.equal(node.nativeNode.style, 'color: teal; width: 3px;')
}

// Native attribute writes operate on individual values without enumerating props or handler tables.
{
    const node = element('view')
    const guard = { ownKeys() { assert.fail('Native attributes must not classify template nodes') } }
    node.props = new Proxy(node.props, guard)
    node.__handlers = new Proxy(node.__handlers, guard)
    for (const [name, value] of [['id', 'native-attributes'], ['class', 'active'], ['title', 'label'], ['data-state', 3], ['style', 'color: blue;']]) {
        node.setAttribute(name, value)
        assert.equal(node.getAttribute(name), value)
        node.removeAttribute(name)
        assert.equal(node.getAttribute(name), '')
    }
    node.removeAttribute('missing')
}

// Count serialization independently of native assignments; inspecting the result happens after capturing counts.
const descriptor = Object.getOwnPropertyDescriptor(Style.prototype, 'cssText')
let reads = 0
Object.defineProperty(Style.prototype, 'cssText', {
    ...descriptor,
    get() { reads += 1; return descriptor.get.call(this) }
})
// Logical style setters own delegate calls; native forwarding is counted separately.
const delegateDescriptor = Object.getOwnPropertyDescriptor(Style.prototype, 'delegateStyleUpdate')
let delegates = 0
Object.defineProperty(Style.prototype, 'delegateStyleUpdate', {
    ...delegateDescriptor,
    value(...args) {
        delegates += 1
        return Reflect.apply(delegateDescriptor.value, this, args)
    }
})
function probe(node) {
    let css = node.nativeNode.style
    const writes = []
    Object.defineProperty(node.nativeNode, 'style', {
        get() { return css },
        set(value) { css = value; writes.push(value) }
    })
    return {
        run(update) {
            reads = 0
            delegates = 0
            writes.length = 0
            update()
            return { reads, delegates, writes: [...writes], css }
        }
    }
}
const node = element('view')
const native = probe(node)
const first = { color: 'red', width: 12, height: 4, opacity: 0.5, zIndex: 2, marginTop: 0,
    paddingLeft: 3, borderWidth: 1, backgroundColor: 'white', lineHeight: 1.25,
    '--accent': 'gold', WebkitLineClamp: 2 }
const initial = native.run(() => hostConfig.finalizeInitialChildren(node, 'view', { style: first }))
assert.equal(initial.reads, 1)
assert.equal(initial.delegates, Object.keys(first).length)
assert.equal(initial.writes.length, 1)
assert.equal(initial.css, node.style.cssText)
assert.match(initial.css, /width: 12px;/)
assert.match(initial.css, /margin-top: 0px;/)
assert.match(initial.css, /opacity: 0.5;/)
assert.match(initial.css, /line-height: 1.25;/)
assert.match(initial.css, /--accent: gold;/)
assert.match(initial.css, /-webkit-line-clamp: 2;/)
const noop = native.run(() => hostConfig.commitUpdate(node, 'view', { style: first }, { style: { ...first } }))
assert.equal(noop.reads, 0)
assert.deepEqual(noop.writes, [])

// Run the same transitions through direct forwarding and WX batching, with exact old-value equality.
const batchStyleUpdate = host.batchStyleUpdate
assert.equal(typeof batchStyleUpdate, 'function')
const transitions = [
    first,
    { color: 'blue', width: 0, opacity: 0, '--accent': 'silver', WebkitLineClamp: 3 },
    'color: green; width: 7px; --accent: teal; background-image: url(http:x/y:z);',
    { color: 'black', height: 10, '--tone': 2, WebkitTransform: 'translateX(1px)' },
    null,
    { color: 'purple', width: 1 },
    { color: null, width: undefined },
    undefined,
    {},
    { color: 'orange' }
]
function exercise(batched, observed, type) {
    const node = element(type)
    const native = probe(node)
    const observer = new MutationObserver(() => {})
    if (observed) { observer.observe(node, { attributes: true, attributeOldValue: true }) }
    const results = []
    let previous = {}
    try {
        if (!batched) {
            host.batchStyleUpdate = (_element, update) => { update() }
        }
        for (const style of transitions) {
            const next = style === undefined ? {} : { style }
            const result = native.run(() => hostConfig.commitUpdate(node, type, previous, next))
            const records = observer.takeRecords()
            for (const record of records) {
                assert.strictEqual(record.target, node)
                assert.equal(record.attributeName, 'style')
            }
            assert.equal(result.css, node.style.cssText)
            if (batched) {
                assert(result.writes.length <= 1)
                if (!observed) { assert.equal(result.reads, result.writes.length) }
            }
            results.push({ css: result.css, delegates: result.delegates,
                oldValues: records.map(record => record.oldValue), writes: result.writes.length })
            previous = next
        }
    } finally {
        observer.disconnect()
        host.batchStyleUpdate = batchStyleUpdate
    }
    return results
}
for (const type of ['view', 'input']) {
    for (const observed of [false, true]) {
        const direct = exercise(false, observed, type)
        const batched = exercise(true, observed, type)
        assert(direct[0].writes > 1)
        assert.equal(batched[0].writes, 1)
        assert.deepEqual(batched.map(({ css, delegates, oldValues }) => ({ css, delegates, oldValues })),
            direct.map(({ css, delegates, oldValues }) => ({ css, delegates, oldValues })))
    }
}

const scoped = element('view')
const scopedNative = probe(scoped)
const observer = new MutationObserver(() => {})
observer.observe(scoped, { attributes: true, attributeOldValue: true })
const nested = scopedNative.run(() => host.batchStyleUpdate(scoped, () => {
    // The clean outer scope owns the first mutation made by a nested update.
    host.batchStyleUpdate(scoped, () => { scoped.style.color = 'red' })
    assert.equal(scoped.nativeNode.style, '')
    host.batchStyleUpdate(scoped, () => { scoped.style.width = '2px' })
    assert.equal(scoped.nativeNode.style, '')
}))
assert.deepEqual(nested.writes, ['color: red; width: 2px;'])
assert.equal(nested.reads, 3)
assert.equal(nested.delegates, 2)
assert.deepEqual(observer.takeRecords().map(record => record.oldValue), ['', 'color: red;'])
observer.disconnect()
const empty = scopedNative.run(() => host.batchStyleUpdate(scoped, () => {}))
assert.deepEqual(empty.writes, [])
assert.equal(empty.reads, 0)
const same = scopedNative.run(() => host.batchStyleUpdate(scoped, () => { scoped.style.color = 'red' }))
assert.deepEqual(same.writes, [])

// A nested update on a different element owns an independent flush boundary.
const other = element('view')
const otherNative = probe(other)
const distinct = otherNative.run(() => host.batchStyleUpdate(scoped, () => {
    scoped.style.height = '3px'
    host.batchStyleUpdate(other, () => { other.style.color = 'blue'; other.style.width = '4px' })
    assert.equal(other.nativeNode.style, 'color: blue; width: 4px;')
    assert.equal(scoped.nativeNode.style, 'color: red; width: 2px;')
}))
assert.equal(distinct.writes.length, 1)
assert.equal(scoped.nativeNode.style, 'color: red; width: 2px; height: 3px;')

// Exceptions flush completed logical mutations, release the scope, and retain the original error identity.
const failure = new Error('style getter failed')
const failed = native.run(() => {
    assert.throws(() => hostConfig.commitUpdate(node, 'view', { style: first }, { style: {
        color: 'navy',
        get height() { throw failure }
    } }), error => error === failure)
})
assert.equal(failed.writes.length, 1)
assert.equal(failed.reads, 1)
assert.equal(failed.css, node.style.cssText)
assert.match(failed.css, /color: navy;/)
for (const update of [
    () => { node.style.color = 'pink' },
    () => { node.style.setProperty('--custom', 'value') },
    () => { node.style.removeProperty('color') },
    () => { node.style.cssText = 'height: 8px; color: gray;' },
    () => { node.setAttribute('style', 'width: 4px; color: lime;') },
    () => { node.removeAttribute('style') }
]) {
    const result = native.run(update)
    assert.equal(result.writes.length, 1)
    assert.equal(result.css, node.style.cssText)
}

// The native setter can re-enter after the scope has been removed.
const reentrant = element('view')
let writes = 0
let value = ''
Object.defineProperty(reentrant.nativeNode, 'style', {
    get() { return value },
    set(css) {
        writes += 1
        value = css
        if (writes === 1) { reentrant.style.width = '5px' }
    }
})
host.batchStyleUpdate(reentrant, () => { reentrant.style.color = 'red' })
assert.equal(writes, 2)
assert.equal(value, 'color: red; width: 5px;')
// Catching a nested failure keeps the outer scope active until its own synchronous completion.
const recovered = scopedNative.run(() => host.batchStyleUpdate(scoped, () => {
    assert.throws(() => host.batchStyleUpdate(scoped, () => {
        scoped.style.color = 'blue'
        throw failure
    }), error => error === failure)
    assert.equal(scoped.nativeNode.style, 'color: red; width: 2px; height: 3px;')
    scoped.style.width = '6px'
}))
assert.deepEqual(recovered.writes, ['color: blue; width: 6px; height: 3px;'])

// A failed native flush also releases the scope before subsequent imperative writes.
const rejected = element('view')
let rejectWrite = true
let accepted = ''
Object.defineProperty(rejected.nativeNode, 'style', {
    get() { return accepted },
    set(css) {
        if (rejectWrite) { throw failure }
        accepted = css
    }
})
assert.throws(() => host.batchStyleUpdate(rejected, () => {
    rejected.style.color = 'red'
}), error => error === failure)
rejectWrite = false
rejected.style.width = '2px'
assert.equal(accepted, 'color: red; width: 2px;')
Object.defineProperty(Style.prototype, 'cssText', descriptor)
Object.defineProperty(Style.prototype, 'delegateStyleUpdate', delegateDescriptor)
`
