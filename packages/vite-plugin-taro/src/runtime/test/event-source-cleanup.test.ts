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
        test(`event-source cleanup (${target}, ${mode}): ordered identity cleanup and retained move indexes`, async () => {
            const config = await resolveConfig(
                {
                    configFile: false,
                    plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
                },
                'build'
            )
            const entry = 'test:event-source-cleanup'
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
                    assert.fail('Cleanup fixtures capture template updates synchronously')
                }
            })
        })
    }
}

const fixture = `
import assert from 'node:assert/strict'
import { document, eventSource, TaroEvent } from 'vite-plugin-taro-runtime/runtime/mini'

function createTree() {
    const tree = document.createElement('view')
    tree.id = 'tree-' + tree.sid
    const first = document.createElement('view')
    first.id = 'old-' + first.sid
    first.id = 'first-' + first.sid
    assert.equal(document.getElementById('old-' + first.sid), null)
    const text = document.createTextNode('first')
    const comment = document.createComment('anchor')
    const second = document.createElement('view')
    const last = document.createTextNode('last')
    last.uid = ''
    const leaf = document.createElement('view')
    leaf.id = 'leaf-' + leaf.sid
    tree.appendChild(first)
    first.appendChild(text)
    first.appendChild(comment)
    tree.appendChild(second)
    second.appendChild(last)
    second.appendChild(leaf)
    return { tree, nodes: [tree, first, text, comment, second, last, leaf] }
}

function keys(nodes) {
    return nodes.flatMap(node => node.uid && node.uid !== node.sid ? [node.sid, node.uid] : [node.sid])
}

function checkIndex(nodes, present) {
    for (const node of nodes) {
        for (const key of keys([node])) {
            assert.strictEqual(eventSource.get(key), present ? node : undefined)
            assert.strictEqual(document.getElementById(key), present ? node : null)
        }
    }
}

function recordDeletes(operation) {
    // Record exact Map deletion order while retaining the singleton's normal receiver and behavior.
    const deleted = []
    const remove = eventSource.delete
    eventSource.delete = function (key) {
        assert.strictEqual(this, eventSource)
        deleted.push(key)
        return remove.call(this, key)
    }
    try {
        operation()
        return deleted
    } finally {
        delete eventSource.delete
    }
}

function snapshot(nodes) {
    return nodes.map(node => ({
        node,
        parent: node.parentNode,
        children: node.childNodes,
        contents: node.childNodes.slice()
    }))
}

function checkDescendants(tree, snapshots) {
    for (const { node, parent, children, contents } of snapshots) {
        assert.strictEqual(node.childNodes, children)
        assert.deepEqual(node.childNodes, contents)
        if (node !== tree) {
            assert.strictEqual(node.parentNode, parent)
        }
    }
}

for (const operation of ['remove', 'replace', 'clear', 'batched-remove', 'same-parent', 'cross-parent', 'detach-preserve']) {
    const root = document.createElement('root')
    // Observe cleanup through real public mutations, with template output captured at its scheduling boundary.
    root.enqueueUpdate = () => {}
    const parent = document.createElement('view')
    const destination = document.createElement('view')
    root.appendChild(parent)
    root.appendChild(destination)
    const { tree, nodes } = createTree()
    const before = document.createElement('view')
    const after = document.createElement('view')
    const replacement = document.createElement('view')
    parent.appendChild(before)
    parent.appendChild(tree)
    parent.appendChild(after)
    const snapshots = snapshot(nodes)
    // These journals verify presentation timing and listener identity independently of the event index.
    const presentations = []
    const events = []
    tree.addEventListener('tap', event => events.push(event.type), { sideEffect: false })
    const handlers = tree.__handlers
    const delegate = parent.delegateChildRemoval
    parent.delegateChildRemoval = function (child, options) {
        assert.equal(child.parentNode, null)
        checkIndex(child === tree ? nodes : [child], options.cleanRef === false)
        presentations.push(child)
        return delegate.call(this, child, options)
    }
    const deleted = recordDeletes(() => {
        if (operation === 'remove') {
            parent.removeChild(tree)
        } else if (operation === 'replace') {
            parent.replaceChild(replacement, tree)
        } else if (operation === 'clear') {
            parent.textContent = ''
        } else if (operation === 'batched-remove') {
            parent.removeChild(tree, { doUpdate: false })
        } else if (operation === 'same-parent') {
            parent.appendChild(tree)
        } else if (operation === 'cross-parent') {
            destination.appendChild(tree)
        } else {
            parent.removeChild(tree, { cleanRef: false })
        }
    })
    const retained = ['same-parent', 'cross-parent', 'detach-preserve'].includes(operation)
    const removed = operation === 'clear' ? [before, ...nodes, after] : retained ? [] : nodes
    assert.deepEqual(deleted, keys(removed), operation)
    assert.deepEqual(presentations, operation === 'same-parent' ? [] : operation === 'clear' ? [before, tree, after] : [tree])
    checkIndex(nodes, retained)
    checkIndex([root, parent, destination, replacement], true)
    checkIndex([before, after], operation !== 'clear')
    checkDescendants(tree, snapshots)
    assert.strictEqual(tree.__handlers, handlers)
    tree.dispatchEvent(new TaroEvent('tap', { bubbles: false }))
    assert.deepEqual(events, ['tap'])
}

// Dense child arrays remain intact while cleanup visits parents before children in sibling order.
{
    const { tree, nodes } = createTree()
    const snapshots = snapshot(nodes)
    const outside = document.createElement('view')
    for (const node of nodes) {
        Object.defineProperties(node.childNodes, {
            forEach: { value() { assert.fail('Subtree cleanup must use direct child indexing') } },
            [Symbol.iterator]: { value() { assert.fail('Subtree cleanup must use direct child indexing') } }
        })
        Object.freeze(node.childNodes)
    }
    assert.deepEqual(recordDeletes(() => eventSource.removeNodeTree(tree)), keys(nodes))
    checkIndex(nodes, false)
    checkIndex([outside], true)
    checkDescendants(tree, snapshots)
}
`
