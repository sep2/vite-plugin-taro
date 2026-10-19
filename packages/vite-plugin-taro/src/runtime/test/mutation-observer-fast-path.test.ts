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
        for (const enabled of [false, true]) {
            test(`mutation observers (${target}, ${mode}, enabled=${enabled}): idle fast path and subscribed records`, async () => {
                const config = await resolveConfig(
                    {
                        configFile: false,
                        plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
                    },
                    'build'
                )
                const entry = 'test:mutation-observer-fast-path'
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
                            ENABLE_MUTATION_OBSERVER: JSON.stringify(enabled)
                        }
                    },
                    output: { format: 'cjs' },
                    write: false
                })
                const chunk = result.output[0]
                assert.ok(chunk?.type === 'chunk')
                const exports: { completion?: Promise<void> } = {}
                runInNewContext(chunk.code, {
                    exports,
                    require,
                    global: {},
                    console,
                    setTimeout() {
                        assert.fail('Native delegates must not schedule template updates')
                    }
                })
                assert.ok(exports.completion)
                await exports.completion
            })
        }
    }
}

const fixture = `
import assert from 'node:assert/strict'
import { document, extend, MutationObserver, Style, TaroElement, TaroNode, TaroText } from 'vite-plugin-taro-runtime/runtime/mini'

// Native delegates isolate mutation-record preparation from template serialization.
TaroNode.extend('delegateChildInsertion', () => {})
TaroNode.extend('delegateChildRemoval', () => {})
TaroNode.extend('delegateChildReset', () => {})
TaroElement.extend('delegateAttributeUpdate', () => {})
TaroElement.extend('delegateAttributeRemoval', () => {})
extend(TaroText, 'delegateTextUpdate', () => {})
extend(Style, 'delegateStyleUpdate', () => {})

function checkIdleMutations() {
    assert.equal(MutationObserver.hasObservers, false)
    const record = MutationObserver.record
    MutationObserver.record = () => assert.fail('Idle mutations must not construct or publish records')
    try {
        const parent = document.createElement('view')
        const first = document.createElement('view')
        const second = document.createElement('view')
        const replacement = document.createElement('view')
        for (const node of [first, second, replacement]) {
            for (const name of ['previousSibling', 'nextSibling']) {
                Object.defineProperty(node, name, {
                    get() { assert.fail('Idle mutations must not resolve record siblings') }
                })
            }
        }
        Object.defineProperty(parent.childNodes, 'slice', {
            value() { assert.fail('Idle textContent must not snapshot the old children') }
        })
        parent.appendChild(first)
        parent.insertBefore(second, first)
        parent.appendChild(second)
        parent.replaceChild(replacement, first)
        parent.removeChild(second)
        assert.deepEqual(parent.childNodes, [replacement])
        parent.textContent = 'replacement'
        const text = parent.firstChild
        assert.equal(text.nodeValue, 'replacement')
        text.nodeValue = 'nodeValue'
        text.data = 'data'
        text.textContent = 'textContent'
        assert.equal(text.nodeValue, 'textContent')
        parent.textContent = ''
        assert.equal(parent.childNodes.length, 0)
        assert.equal(replacement.parentNode, null)

        const node = document.createElement('view')
        node.getAttribute = () => assert.fail('Idle attributes must not read old values')
        node.setAttribute('title', 'first')
        node.setAttribute('title', 'second')
        node.removeAttribute('title')
        node.removeAttribute('missing')
        assert.equal(Object.hasOwn(node.props, 'title'), false)

        const descriptor = Object.getOwnPropertyDescriptor(Style.prototype, 'cssText')
        Object.defineProperty(node.style, 'cssText', {
            get() { assert.fail('Idle styles must not serialize old CSS') },
            set: descriptor.set
        })
        node.style.color = 'red'
        node.style.color = 'red'
        node.style.setProperty('--accent', 'green')
        assert.equal(node.style.removeProperty('color'), 'red')
        node.style.cssText = 'margin-top: 2px; color: blue;'
        assert.equal(node.style.marginTop, '2px')
        node.setAttribute('style', 'color: gold;')
        assert.equal(node.style.color, 'gold')
        node.removeAttribute('style')
        assert.equal(node.style.color, '')
    } finally {
        MutationObserver.record = record
    }
}

async function checkObservers() {
    checkIdleMutations()
    // Delivery journals retain each asynchronous callback's exact record batch.
    const deliveries = []
    const observer = new MutationObserver(records => deliveries.push(records))
    const other = new MutationObserver(() => {})
    assert.equal(MutationObserver.hasObservers, false, 'construction alone leaves observers unregistered')
    const parent = document.createElement('view')
    const first = document.createElement('view')
    const second = document.createElement('view')
    const text = document.createTextNode('seed')
    first.appendChild(text)
    parent.appendChild(first)
    parent.appendChild(second)
    const options = {
        attributes: true, attributeOldValue: true, childList: true,
        characterData: true, characterDataOldValue: true, subtree: true
    }
    observer.observe(parent, options)
    observer.observe(parent, options)
    if (!ENABLE_MUTATION_OBSERVER) {
        assert.equal(MutationObserver.hasObservers, false)
        checkIdleMutations()
        observer.disconnect()
        other.disconnect()
        return
    }
    assert.equal(MutationObserver.hasObservers, true)
    other.observe(parent, options)

    parent.setAttribute('title', 'first')
    parent.setAttribute('title', 'second')
    parent.removeAttribute('title')
    const attributes = observer.takeRecords()
    assert.deepEqual(attributes.map(record => [record.type, record.attributeName, record.oldValue]), [
        ['attributes', 'title', ''], ['attributes', 'title', 'first'], ['attributes', 'title', 'second']
    ])
    assert.ok(attributes.every(record => record.target === parent))
    assert.deepEqual(other.takeRecords(), attributes)

    parent.style.color = 'red'
    parent.style.color = 'blue'
    parent.style.cssText = 'margin-top: 2px;'
    parent.removeAttribute('style')
    assert.deepEqual(observer.takeRecords().map(record => [record.attributeName, record.oldValue]), [
        ['style', ''], ['style', 'color: red;'], ['style', 'color: blue;'],
        ['style', 'margin-top: 2px;'], ['style', 'margin-top: 2px;']
    ])
    other.takeRecords()

    text.nodeValue = 'first'
    text.data = 'second'
    text.textContent = 'third'
    const characters = observer.takeRecords()
    assert.deepEqual(characters.map(record => [record.type, record.oldValue]), [
        ['characterData', 'seed'], ['characterData', 'first'], ['characterData', 'second']
    ])
    assert.ok(characters.every(record => record.target === text))
    other.takeRecords()

    const inserted = document.createElement('view')
    parent.insertBefore(inserted, second)
    const [insertion] = observer.takeRecords()
    assert.deepEqual(insertion.addedNodes, [inserted])
    assert.deepEqual(insertion.removedNodes, [])
    assert.strictEqual(insertion.previousSibling, first)
    assert.strictEqual(insertion.nextSibling, second)

    parent.appendChild(first)
    const [move] = observer.takeRecords()
    assert.deepEqual(move.addedNodes, [first])
    assert.deepEqual(move.removedNodes, [])
    assert.strictEqual(move.previousSibling, second)
    assert.equal(move.nextSibling, null)

    const replacement = document.createElement('view')
    parent.replaceChild(replacement, inserted)
    const [replace] = observer.takeRecords()
    assert.deepEqual(replace.addedNodes, [replacement])
    assert.deepEqual(replace.removedNodes, [inserted])
    assert.equal(replace.previousSibling, null)
    assert.strictEqual(replace.nextSibling, second)

    parent.removeChild(second)
    const [removal] = observer.takeRecords()
    assert.deepEqual(removal.removedNodes, [second])
    assert.strictEqual(removal.previousSibling, replacement)
    assert.strictEqual(removal.nextSibling, first)

    parent.textContent = 'replacement'
    const newText = parent.firstChild
    const reset = observer.takeRecords()
    assert.equal(reset.length, 2)
    assert.deepEqual(reset[0].addedNodes, [newText])
    assert.deepEqual(reset[1].removedNodes, [replacement, first])
    assert.deepEqual(reset[1].addedNodes, [newText])
    parent.textContent = ''
    const [clear] = observer.takeRecords()
    assert.deepEqual(clear.removedNodes, [newText])
    assert.deepEqual(clear.addedNodes, [])
    other.takeRecords()

    parent.setAttribute('title', 'delivered')
    parent.style.color = 'green'
    assert.deepEqual(deliveries, [], 'recording must retain asynchronous delivery')
    await Promise.resolve()
    assert.equal(deliveries.length, 1, 're-observing must retain one registration')
    assert.deepEqual(deliveries[0].map(record => [record.attributeName, record.oldValue]), [
        ['title', ''], ['style', '']
    ])

    observer.disconnect()
    assert.equal(MutationObserver.hasObservers, true, 'the remaining observer keeps recording enabled')
    parent.setAttribute('title', 'remaining')
    assert.equal(other.takeRecords()[0].oldValue, 'delivered')
    other.disconnect()
    assert.equal(MutationObserver.hasObservers, false)
    checkIdleMutations()

    observer.observe(parent, { attributes: true })
    parent.appendChild(first)
    first.setAttribute('title', 'descendant')
    const unrelated = document.createElement('view')
    unrelated.setAttribute('title', 'unrelated')
    assert.deepEqual(observer.takeRecords(), [], 'matching retains target, mutation-type and subtree filtering')
    parent.setAttribute('title', 'subscribed-again')
    const [resubscribed] = observer.takeRecords()
    assert.equal(resubscribed.oldValue, null)
    assert.equal(MutationObserver.hasObservers, true, 'taking records retains the subscription')
    observer.observe(parent, { attributes: true, attributeOldValue: true, subtree: true })
    first.setAttribute('title', 'observed-descendant')
    const [descendant] = observer.takeRecords()
    assert.strictEqual(descendant.target, first)
    assert.equal(descendant.oldValue, 'descendant')
    observer.disconnect()
    assert.equal(MutationObserver.hasObservers, false)
    // Disconnecting retains already queued callback scheduling, but has no subscribed recipients.
    await Promise.resolve()
}

export const completion = checkObservers()
`
