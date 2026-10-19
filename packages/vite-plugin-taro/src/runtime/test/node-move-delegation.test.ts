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
        test(`node moves (${target}, ${mode}): delegates, template payloads and logical identity`, async () => {
            const config = await resolveConfig(
                {
                    configFile: false,
                    plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
                },
                'build'
            )
            const entry = 'test:node-move-delegation'
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
                    assert.fail('The fixture explicitly flushes template batches')
                }
            })
        })
    }
}

const fixture = `
import assert from 'node:assert/strict'
import { document, hydrate, MutationObserver, TaroEvent } from 'vite-plugin-taro-runtime/runtime/mini'

function setup(rooted) {
    const root = document.createElement('root')
    const parent = document.createElement('view')
    if (rooted) {
        root.appendChild(parent)
    }
    const nodes = Array.from({ length: 5 }, (_, index) => {
        const node = document.createElement('view')
        node.id = 'move-' + node.sid
        node.appendChild(document.createTextNode(String(index)))
        parent.appendChild(node)
        return node
    })
    // The observer and delegation journals capture only the operation under test.
    const calls = []
    const observer = new MutationObserver(() => {})
    observer.observe(parent, { childList: true })
    for (const name of ['delegateChildInsertion', 'delegateChildRemoval']) {
        const delegate = parent[name]
        parent[name] = function (...args) {
            assert.ok(this.childNodes.every(child => child.parentNode === this))
            calls.push([name, ...args])
            return delegate.apply(this, args)
        }
    }
    root.updatePayloads.length = 0
    return { root, parent, nodes, calls, observer }
}

function checkOrder(parent, expected) {
    assert.deepEqual(parent.childNodes, expected)
    for (const [index, node] of expected.entries()) {
        assert.strictEqual(node.parentNode, parent)
        assert.strictEqual(node.previousSibling, expected[index - 1] ?? null)
        assert.strictEqual(node.nextSibling, expected[index + 1] ?? null)
    }
}

function flush(root, parents) {
    // Flush the real scheduler synchronously, retaining its lazy serialization and payload coalescing.
    const batches = []
    root.scheduleTask = callback => callback()
    root.performUpdate(false, data => batches.push(data))
    root.pendingUpdate = false
    assert.equal(batches.length, 1)
    for (const parent of parents) {
        assert.deepEqual(batches[0][parent._path + '.cn'], hydrate(parent).cn)
    }
    assert.equal(root.updatePayloads.length, 0)
}

// Cover both directions, append, already-last, and replacement by either an earlier or later sibling.
for (const rooted of [false, true]) {
    for (const operation of ['forward', 'backward', 'append', 'last', 'first', 'adjacent', 'replace-forward', 'replace-backward']) {
        const { root, parent, nodes: [a, b, c, d, e], calls, observer } = setup(rooted)
        const moving = operation === 'first' ? a
            : operation === 'backward' || operation === 'last' || operation === 'replace-backward' ? e : b
        const previousIndex = parent.childNodes.indexOf(moving)
        const descendant = moving.firstChild
        const id = moving.id
        const sid = moving.sid
        const listeners = moving.__handlers
        // The event log verifies that the retained identity still dispatches after moving.
        const events = []
        moving.addEventListener('tap', () => events.push('tap'))
        root.updatePayloads.length = 0
        const expected = {
            forward: [a, c, d, b, e], backward: [a, e, b, c, d], append: [a, c, d, e, b],
            last: [a, b, c, d, e], first: [b, c, d, e, a], adjacent: [a, b, c, d, e], 'replace-forward': [a, c, d, b], 'replace-backward': [a, e, c, d]
        }[operation]
        const replaced = operation === 'replace-forward' ? e : b
        const result = operation.startsWith('replace-') ? parent.replaceChild(moving, replaced)
            : operation === 'forward' ? parent.insertBefore(b, e)
            : operation === 'backward' ? parent.insertBefore(e, b)
            : operation === 'adjacent' ? parent.insertBefore(b, c)
            : parent.appendChild(moving)
        assert.strictEqual(result, operation.startsWith('replace-') ? replaced : moving)
        checkOrder(parent, expected)
        assert.strictEqual(moving.firstChild, descendant)
        assert.strictEqual(descendant.parentNode, moving)
        assert.strictEqual(moving.__handlers, listeners)
        assert.equal(moving.sid, sid)
        assert.strictEqual(document.getElementById(id), moving)
        assert.strictEqual(document.getElementById(descendant.sid), descendant)
        moving.dispatchEvent(new TaroEvent('tap', { bubbles: false }))
        assert.deepEqual(events, ['tap'])
        assert.equal(calls.filter(call => call[0] === 'delegateChildInsertion').length, 1)
        assert.equal(calls[0][5], previousIndex, 'the delegate receives the original position, including zero')
        const removals = calls.filter(call => call[0] === 'delegateChildRemoval')
        assert.deepEqual(removals.map(call => call[1]), operation.startsWith('replace-') ? [replaced] : [])
        const records = observer.takeRecords()
        assert.equal(records.length, 1)
        assert.strictEqual(records[0].target, parent)
        assert.deepEqual(records[0].addedNodes, [moving])
        assert.deepEqual(records[0].removedNodes, operation.startsWith('replace-') ? [replaced] : [])
        assert.strictEqual(records[0].previousSibling, moving.previousSibling)
        assert.strictEqual(records[0].nextSibling, moving.nextSibling)
        if (rooted) {
            assert.equal(root.updatePayloads.length, 1)
            assert.equal(root.updatePayloads[0].path, parent._path + '.cn')
            flush(root, [parent])
        } else {
            assert.deepEqual(root.updatePayloads, [])
        }
        observer.disconnect()
    }
}

// Self-insertion and self-replacement retain the node without delegating or recording a mutation.
for (const replace of [false, true]) {
    const { root, parent, nodes, calls, observer } = setup(true)
    const child = nodes[1]
    assert.strictEqual(replace ? parent.replaceChild(child, child) : parent.insertBefore(child, child), child)
    checkOrder(parent, nodes)
    assert.deepEqual(calls, [])
    assert.deepEqual(observer.takeRecords(), [])
    assert.deepEqual(root.updatePayloads, [])
    assert.strictEqual(document.getElementById(child.id), child)
    observer.disconnect()
}

// Several moves and edits in one batch serialize the final tree, filtering comments at flush time.
{
    const { root, parent, nodes: [a, b, c, d, e], observer } = setup(true)
    const comment = document.createComment('anchor')
    parent.insertBefore(comment, c)
    root.updatePayloads.length = 0
    parent.appendChild(b)
    parent.insertBefore(e, a)
    parent.insertBefore(comment, b)
    b.firstChild.nodeValue = 'latest'
    checkOrder(parent, [e, a, c, d, comment, b])
    flush(root, [parent])
    observer.disconnect()
}

// Cross-parent moves still notify the old parent, preserve event indexes and refresh the nearest context.
{
    const { root, parent, nodes: [a, b, c, d, e], calls, observer } = setup(true)
    const otherRoot = document.createElement('root')
    const other = document.createElement('view')
    otherRoot.appendChild(other)
    other.appendChild(document.createElement('view'))
    const contexts = [{ page: 'first' }, { page: 'second' }, { page: 'updated' }]
    parent.ctx = contexts[0]
    other.ctx = contexts[1]
    if (process.env.TARO_ENV === 'weapp') {
        assert.strictEqual(b.firstChild._scope, contexts[0])
        parent.ctx = contexts[2]
        parent.appendChild(b)
        assert.strictEqual(b.firstChild._scope, contexts[2], 'a move invalidates cached contexts')
    }
    calls.length = 0
    root.updatePayloads.length = 0
    otherRoot.updatePayloads.length = 0
    other.insertBefore(b, other.firstChild)
    checkOrder(parent, [a, c, d, e])
    assert.deepEqual(calls.map(call => call[0]), ['delegateChildRemoval'])
    assert.strictEqual(document.getElementById(b.id), b)
    assert.strictEqual(document.getElementById(b.firstChild.sid), b.firstChild)
    if (process.env.TARO_ENV === 'weapp') {
        assert.strictEqual(b.firstChild._scope, contexts[1])
    }
    flush(root, [parent])
    flush(otherRoot, [other])
    other.removeChild(b)
    assert.equal(b.parentNode, null)
    assert.equal(document.getElementById(b.id), null)
    assert.equal(document.getElementById(b.firstChild.sid), null)
    if (process.env.TARO_ENV === 'weapp') {
        assert.equal(b.firstChild._scope, null)
    }
    observer.disconnect()
}

// Fragment expansion and true deletion retain their existing insertion/removal delegates.
{
    const { root, parent, nodes: [a, b, c, d, e], calls, observer } = setup(true)
    const fragment = document.createElement('document-fragment')
    const first = document.createElement('view')
    const second = document.createElement('text')
    fragment.appendChild(first)
    fragment.appendChild(second)
    assert.strictEqual(parent.insertBefore(fragment, b), fragment)
    assert.equal(fragment.childNodes.length, 0)
    checkOrder(parent, [a, first, second, b, c, d, e])
    assert.deepEqual(calls.map(call => call[0]), ['delegateChildInsertion', 'delegateChildInsertion'])
    assert.ok(calls.every(call => call[5] === undefined), 'fresh insertions carry no previous sibling index')
    flush(root, [parent])
    calls.length = 0
    observer.takeRecords()
    parent.removeChild(b)
    checkOrder(parent, [a, first, second, c, d, e])
    assert.deepEqual(calls.map(call => call[0]), ['delegateChildRemoval'])
    const [record] = observer.takeRecords()
    assert.deepEqual(record.removedNodes, [b])
    assert.strictEqual(record.previousSibling, second)
    assert.strictEqual(record.nextSibling, c)
    assert.equal(document.getElementById(b.id), null)
    flush(root, [parent])
    observer.disconnect()
}
`
