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
        test(`event target data (${target}, ${mode}): logical datasets and native fallback`, async () => {
            const config = await resolveConfig(
                {
                    configFile: false,
                    plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
                },
                'build'
            )
            const entry = 'test:event-target-data'
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
                        'process.env.NODE_ENV': JSON.stringify(mode)
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
                    assert.fail('Recording event target data must not schedule template updates')
                }
            })
        })
    }
}

const fixture = `
import assert from 'node:assert/strict'
import { document, TaroEvent } from 'vite-plugin-taro-runtime/runtime/mini'

function event(target, currentTarget, detail) {
    return new TaroEvent('tap', { bubbles: true, cancelable: true }, { target, currentTarget, detail })
}
// Initialize the ordinary logical document without loading or installing a DOM host.
assert.equal(document.getElementById('missing'), null)
for (const identity of [{}, { id: '' }, { id: 'missing' }, { dataset: { sid: 'missing' } }]) {
    const nativeTarget = { ...identity, dataset: Object.freeze({ ...identity.dataset, role: 'child' }) }
    const nativeCurrent = { ...identity, dataset: Object.freeze({ ...identity.dataset, role: 'parent' }) }
    const e = event(nativeTarget, nativeCurrent, { value: 7 })
    assert.deepEqual(e.target.dataset, nativeTarget.dataset)
    assert.deepEqual(e.currentTarget.dataset, nativeCurrent.dataset)
    assert.notStrictEqual(e.currentTarget, e.target, 'missing indexes do not prove identical targets')
    assert.equal(e.target.value, 7)
    assert.equal(e.currentTarget.value, 7)
    assert.equal(Object.hasOwn(nativeTarget, 'value'), false)
    assert.equal(Object.hasOwn(nativeCurrent, 'value'), false)
    assert.strictEqual(e.target, e.target)
    assert.strictEqual(e.currentTarget, e.currentTarget)
    const same = event(nativeTarget, nativeTarget, {})
    assert.strictEqual(same.currentTarget, same.target, 'the same native object proves target identity')
}
const missing = event({}, {}, {})
assert.deepEqual(missing.target.dataset, {})
assert.deepEqual(missing.currentTarget.dataset, {})
const noNativeEvent = new TaroEvent('tap', { bubbles: true, cancelable: true })
assert.strictEqual(noNativeEvent.currentTarget, noNativeEvent.target)
const noTargets = event(undefined, undefined, { value: 1 })
assert.strictEqual(noTargets.currentTarget, noTargets.target)
assert.equal(noTargets.target.value, 1)

function logicalNode(id, data) {
    const node = document.createElement('view')
    node.id = id
    for (const [key, value] of Object.entries(data)) {
        node.setAttribute('data-' + key, value)
    }
    return node
}
const object = { retained: ['identity'] }
const child = logicalNode('child', { role: 'child', object })
const parent = logicalNode('parent', { role: 'parent' })
const childTarget = { id: child.id, dataset: { role: 'stale', nativeOnly: true } }
const parentTarget = { id: parent.id, dataset: { role: 'stale', nativeOnly: true } }
const indexed = event(childTarget, parentTarget, { cursor: 3 })
assert.deepEqual(indexed.target.dataset, { ...child.dataset })
assert.strictEqual(indexed.target.dataset.object, object)
assert.notStrictEqual(indexed.target.dataset, child.dataset)
assert.strictEqual(indexed.currentTarget.dataset, parent.dataset)
assert.equal(indexed.currentTarget.cursor, 3)
assert.notStrictEqual(indexed.target, indexed.currentTarget)
const sameLogical = event(childTarget, { dataset: { sid: child.sid } }, {})
assert.strictEqual(sameLogical.currentTarget, sameLogical.target)
const oneMissing = event(childTarget, { id: 'missing', dataset: { role: 'native-parent' } }, {})
assert.deepEqual(oneMissing.target.dataset, { ...child.dataset })
assert.equal(oneMissing.currentTarget.dataset.role, 'native-parent')
assert.notStrictEqual(oneMissing.target, oneMissing.currentTarget)

// Preserve Alipay's two-source merge order; each existing logical dataset takes precedence over its raw source.
const wrapper = logicalNode('wrapper', { wrapper: true, role: 'wrapper' })
const alipay = event({
    id: wrapper.id,
    dataset: { sid: wrapper.sid, wrapper: 'stale' },
    targetDataset: { sid: child.sid, role: 'stale' }
}, parentTarget, {})
assert.deepEqual(alipay.target.dataset, { wrapper: true, role: 'child', object })
const missingChild = event({
    id: wrapper.id, dataset: { wrapper: 'stale' },
    targetDataset: { sid: 'missing', role: 'native-child' }
}, parentTarget, {})
assert.deepEqual(missingChild.target.dataset, { wrapper: true, role: 'native-child', sid: 'missing' })
const missingWrapper = event({
    id: 'missing', dataset: { wrapper: 'native', role: 'native-wrapper' },
    targetDataset: { sid: child.sid, role: 'stale' }
}, parentTarget, {})
assert.deepEqual(missingWrapper.target.dataset, { wrapper: 'native', role: 'child', object })
const bothMissing = event({
    dataset: { wrapper: 'native', role: 'native-wrapper' },
    targetDataset: { role: 'native-child' }
}, { dataset: { role: 'native-parent' } }, {})
assert.deepEqual(bothMissing.target.dataset, { wrapper: 'native', role: 'native-child' })

// Removing and reinserting an existing logical node preserves the native payload independently of index lifetime.
parent.appendChild(child)
parent.removeChild(child)
parent.appendChild(child)
assert.equal(document.getElementById(child.sid), null)
assert.equal(document.getElementById(child.id), null)
const reinserted = event({ id: child.id, dataset: { role: 'child', object } }, parentTarget, {})
assert.equal(reinserted.target.dataset.role, 'child')
assert.strictEqual(reinserted.target.dataset.object, object)
assert.strictEqual(reinserted.currentTarget.dataset, parent.dataset)

// The existing lazy caches retain their objects; each uncached getter performs its original two index reads.
const lookup = document.getElementById
let reads = 0
document.getElementById = function (id) {
    reads++
    return lookup.call(this, id)
}
const counted = event({ dataset: { role: 'child' } }, { dataset: { role: 'parent' } }, {})
const firstCurrent = counted.currentTarget
assert.equal(reads, 2)
assert.strictEqual(counted.currentTarget, firstCurrent)
assert.equal(reads, 2)
const firstTarget = counted.target
assert.equal(reads, 4)
assert.strictEqual(counted.target, firstTarget)
assert.equal(reads, 4)
document.getElementById = lookup
`
