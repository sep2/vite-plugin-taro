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
        test(`${target} ${mode}: removing an unregistered handler preserves active listeners`, async () => {
            const config = await resolveConfig(
                {
                    configFile: false,
                    mode,
                    plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
                },
                mode === 'development' ? 'serve' : 'build'
            )
            const platform = { wx: 'weapp', zfb: 'alipay', tt: 'tt' }[target]
            const entry = 'test:event-listener-removal'
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
                                return `import 'vite-plugin-taro-runtime/plugin-platform-${platform}/runtime'\n${fixture}`
                            }
                        }
                    }
                ],
                transform: { define: { ...config.define, 'process.env.NODE_ENV': JSON.stringify(mode) } },
                output: { format: 'cjs' },
                write: false
            })
            const chunk = result.output[0]
            assert.ok(chunk?.type === 'chunk')
            // Isolate Taro's singleton document and hooks per target; all listener operations are synchronous.
            runInNewContext(chunk.code, {
                exports: {},
                require,
                global: {},
                navigator: { userAgent: '' },
                console,
                setTimeout() {
                    assert.fail('Detached listener changes must remain synchronous')
                }
            })
        })
    }
}

const fixture = `
import assert from 'node:assert/strict'
import { document, TaroEvent } from 'vite-plugin-taro-runtime/runtime/mini'

const node = document.createElement('view')
// Record actual dispatch to verify that surviving listeners remain callable with the logical receiver.
const calls = []
function first(event) {
    assert.strictEqual(this, node)
    calls.push(['first', event.type])
}
function second(event) {
    assert.strictEqual(this, node)
    calls.push(['second', event.type])
}
function unknown() { assert.fail('An unregistered handler must not be called') }

node.addEventListener('TaP', first)
node.addEventListener('tap', second)
const handlers = node.__handlers.tap
const registered = handlers.slice()
node.removeEventListener('tap', unknown)
assert.strictEqual(node.__handlers.tap, handlers)
assert.deepEqual(handlers, registered, 'An unmatched removal must preserve every registered handler')
node.dispatchEvent(new TaroEvent('tap'))
assert.deepEqual(calls.splice(0), [['second', 'tap'], ['first', 'tap']])

node.removeEventListener('TAP', first)
assert.deepEqual(handlers, [registered[1]], 'A matching original function removes its stored wrapper')
node.removeEventListener('tap', first)
assert.deepEqual(handlers, [registered[1]], 'Repeated removal must preserve the other handler')
node.removeEventListener('missing', unknown)
node.removeEventListener('tap', undefined)
assert.equal(node.__handlers.missing, undefined)
assert.deepEqual(handlers, [registered[1]])
node.dispatchEvent(new TaroEvent('tap'))
assert.deepEqual(calls.splice(0), [['second', 'tap']])

node.removeEventListener('tap', second)
node.removeEventListener('tap', second)
assert.strictEqual(node.__handlers.tap, handlers)
assert.deepEqual(handlers, [])
node.dispatchEvent(new TaroEvent('tap'))
assert.deepEqual(calls, [])

node.addEventListener('tap', first, { once: true })
node.dispatchEvent(new TaroEvent('tap'))
node.dispatchEvent(new TaroEvent('tap'))
assert.deepEqual(calls, [['first', 'tap']])
assert.deepEqual(handlers, [], 'The once wrapper removes its own registration')
`
