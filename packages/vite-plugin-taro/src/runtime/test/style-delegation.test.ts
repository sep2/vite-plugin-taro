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
        test(`style delegation (${target}, ${mode}): property changes and whole-style replacement`, async () => {
            const config = await resolveConfig(
                {
                    configFile: false,
                    plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
                },
                'build'
            )
            const entry = 'test:style-delegation'
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
                    assert.fail('Recording style delegation must not schedule template updates')
                }
            })
        })
    }
}

const fixture = `
import assert from 'node:assert/strict'
import { document, extend, MutationObserver, Style } from 'vite-plugin-taro-runtime/runtime/mini'

// Keep the real template delegate and capture its ordinary root payloads synchronously.
const root = document.createElement('root')
const payloads = []
root.enqueueUpdate = payload => payloads.push(payload)
const node = document.createElement('view')
root.appendChild(node)
payloads.length = 0
const style = node.style
function expectPayload(value) {
    assert.deepEqual(payloads.splice(0), [{ path: node._path + '.st', value }])
}
style.color = 'red'
expectPayload('color: red;')
style.color = 'red'
assert.deepEqual(payloads, [])
style.setProperty('margin-top', '2px')
expectPayload('color: red; margin-top: 2px;')
assert.equal(style.removeProperty('color'), 'red')
expectPayload('margin-top: 2px;')
style.cssText = 'color: blue; --accent: teal;'
expectPayload('color: blue; --accent: teal;')
style.cssText = ''
expectPayload('')
// Every leading-hyphen name must use the same storage key for set/get/remove and whole-style clearing.
for (const name of ['-webkit-line-clamp', '-moz-user-select', '--theme']) {
    style.setProperty(name, 'initial')
    expectPayload(name + ': initial;')
    assert.equal(style.getPropertyValue(name), 'initial')
    assert.equal(style.removeProperty(name), 'initial')
    expectPayload('')
    assert.equal(style.getPropertyValue(name), '')
    style.setProperty(name, 'replacement')
    expectPayload(name + ': replacement;')
    style.setProperty(name, null)
    expectPayload('')
    style.setProperty(name, 'clear')
    expectPayload(name + ': clear;')
    style.cssText = ''
    expectPayload('')
    assert.equal(style.getPropertyValue(name), '')
}
const detached = document.createElement('view')
detached.style.color = 'red'
assert.deepEqual(payloads, [])

// Record delegate arguments after logical mutation, independently from template serialization.
const calls = []
extend(Style, 'delegateStyleUpdate', function (...args) {
    assert.equal(Boolean(this._pending), false)
    calls.push([this, ...args])
})
const observer = new MutationObserver(() => {})
observer.observe(node, { attributes: true, attributeOldValue: true })
function expectChange(name, value, oldValue) {
    assert.deepEqual(calls.splice(0), [[style, name, value]])
    const records = observer.takeRecords()
    assert.equal(records.length, 1)
    assert.strictEqual(records[0].target, node)
    assert.equal(records[0].attributeName, 'style')
    assert.equal(records[0].oldValue, oldValue)
}
style.color = 'red'
expectChange('color', 'red', '')
style.color = 'red'
assert.deepEqual(calls, [])
assert.deepEqual(observer.takeRecords(), [])
style.setProperty('margin-top', '3px')
expectChange('marginTop', '3px', 'color: red;')
style.opacity = 0
expectChange('opacity', 0, 'color: red; margin-top: 3px;')
assert.equal(style.removeProperty('color'), 'red')
expectChange('color', undefined, 'color: red; margin-top: 3px; opacity: 0;')
assert.equal(style.removeProperty('color'), '')
assert.deepEqual(calls, [])
style.setProperty('--accent', 'green')
expectChange('--accent', 'green', 'margin-top: 3px; opacity: 0;')
style.setProperty('--accent', null)
expectChange('--accent', undefined, 'margin-top: 3px; opacity: 0; --accent: green;')

// The existing _pending batch suppresses intermediate changes and reports one completed replacement.
style.cssText = 'color: blue; --accent: gold; background-image: url(http:x/y:z);'
assert.deepEqual(calls.splice(0), [[style]])
assert.equal(observer.takeRecords()[0].oldValue, 'margin-top: 3px; opacity: 0;')
assert.equal(style.cssText, 'color: blue; --accent: gold; background-image: url(http:x/y:z);')
style.cssText = ''
assert.deepEqual(calls.splice(0), [[style]])
assert.equal(observer.takeRecords()[0].oldValue, 'color: blue; --accent: gold; background-image: url(http:x/y:z);')
assert.equal(style.cssText, '')
observer.disconnect()
assert.deepEqual(payloads, [], 'the delegated path leaves template serialization to the host')
`
