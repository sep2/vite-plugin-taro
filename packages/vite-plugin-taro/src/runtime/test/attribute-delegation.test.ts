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
        test(`attribute delegation (${target}, ${mode}): template classification and mutation ordering`, async () => {
            const config = await resolveConfig(
                {
                    configFile: false,
                    plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
                },
                'build'
            )
            const entry = 'test:attribute-delegation'
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
                    assert.fail('Recording attribute delegation must not schedule template updates')
                }
            })
        })
    }
}

const fixture = `
import assert from 'node:assert/strict'
import { hooks } from '@tarojs/shared'
import { document, getComponentsAlias, MutationObserver } from 'vite-plugin-taro-runtime/runtime/mini'

const root = document.createElement('root')
const node = document.createElement('view')
// The payload journal observes template node transitions independently of the asynchronous scheduler.
const payloads = []
root.enqueueUpdate = payload => payloads.push(payload)
root.appendChild(node)
payloads.length = 0
const aliases = getComponentsAlias()
function expectType(name) {
    const types = payloads.filter(payload => payload.path === node._path + '.nn')
    assert.deepEqual(types.map(payload => payload.value), name === null ? [] : [aliases[name]._num])
    payloads.length = 0
}
assert.equal(node.prepareAttributeMutation(false), true)
assert.equal(node.prepareAttributeMutation(true), false)
node.setAttribute('title', 'first')
expectType('static-view')
assert.equal(node.prepareAttributeMutation(false), false)
assert.equal(node.prepareAttributeMutation(true), true)
node.setAttribute('title', 'second')
expectType(null)
node.className = 'layout'
expectType(null)
node.setAttribute('data-state', 1)
expectType(null)
node.removeAttribute('title')
expectType('pure-view')
node.removeAttribute('missing')
expectType(null)
node.setAttribute('catchMove', true)
expectType('catch-view')
node.setAttribute('catchMove', false)
expectType('static-view')
node.removeAttribute('catchMove')
expectType('pure-view')
const listener = () => {}
node.addEventListener('tap', listener, { sideEffect: false })
assert.equal(node.prepareAttributeMutation(false), false)
assert.equal(node.prepareAttributeMutation(true), false)
node.setAttribute('title', 'interactive')
expectType(null)
node.removeAttribute('title')
expectType(null)
node.removeEventListener('tap', listener, false)
for (const type of ['text', 'input', 'root']) {
    const other = document.createElement(type)
    assert.equal(other.prepareAttributeMutation(false), false)
    assert.equal(other.prepareAttributeMutation(true), false)
}

// The local timeline preserves preparation, old-value recording, interception and presentation order.
const timeline = []
const prepare = node.prepareAttributeMutation
node.prepareAttributeMutation = function (removing) {
    const state = prepare.call(this, removing)
    timeline.push(['prepare', removing, state])
    return state
}
const update = node.delegateAttributeUpdate
node.delegateAttributeUpdate = function (name, value, state) {
    timeline.push(['update', name, value, state, this.getAttribute(name)])
    return update.call(this, name, value, state)
}
const removal = node.delegateAttributeRemoval
node.delegateAttributeRemoval = function (name, state) {
    timeline.push(['remove', name, state, this.getAttribute(name)])
    return removal.call(this, name, state)
}
hooks.tap('onRemoveAttribute', (element, name) => {
    if (element === node) {
        timeline.push(['intercept', name, element.getAttribute(name)])
        return name === 'retained'
    }
})
const observer = new MutationObserver(() => {})
observer.observe(node, { attributes: true, attributeOldValue: true })
const record = MutationObserver.record
MutationObserver.record = function (mutation) {
    if (mutation.target === node) {
        timeline.push(['record', mutation.attributeName, mutation.oldValue])
    }
    return record.call(this, mutation)
}
try {
    node.setAttribute('title', 'value')
    assert.deepEqual(timeline.splice(0), [
        ['prepare', false, true], ['record', 'title', ''], ['update', 'title', 'value', true, 'value']
    ])
    node.removeAttribute('title')
    assert.deepEqual(timeline.splice(0), [
        ['prepare', true, true], ['record', 'title', 'value'], ['intercept', 'title', 'value'], ['remove', 'title', true, '']
    ])
    node.removeAttribute('missing')
    assert.deepEqual(timeline.splice(0), [
        ['prepare', true, false], ['record', 'missing', ''], ['intercept', 'missing', '']
    ])
    node.setAttribute('retained', 'keep')
    timeline.length = 0
    node.removeAttribute('retained')
    assert.deepEqual(timeline.splice(0), [
        ['prepare', true, true], ['record', 'retained', 'keep'], ['intercept', 'retained', 'keep']
    ])
    assert.equal(node.getAttribute('retained'), 'keep')
    assert.deepEqual(observer.takeRecords().map(mutation => [mutation.attributeName, mutation.oldValue]), [
        ['title', ''], ['title', 'value'], ['missing', ''], ['retained', ''], ['retained', 'keep']
    ])
} finally {
    MutationObserver.record = record
    observer.disconnect()
}
`
