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
        test(`template contexts (${target}, ${mode}): cached reads and lifecycle invalidation`, async () => {
            const config = await resolveConfig(
                {
                    configFile: false,
                    plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
                },
                'build'
            )
            const entry = 'test:template-context-resolution'
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
                                const platform = { wx: 'weapp', zfb: 'alipay', tt: 'tt' }[target]
                                return `import ${JSON.stringify(resolveTaroRuntime(`plugin-platform-${platform}/runtime`))}\n${fixture}`
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
                navigator: { userAgent: 'AlipayClient' },
                console,
                setTimeout() {
                    assert.fail('Context checks must not schedule template updates')
                }
            })
        })
    }
}

const fixture = `
import assert from 'node:assert/strict'
import { hooks } from '@tarojs/shared'
import { createRecursiveComponentConfig, document, getNearestCtx, invalidateNearestCtx } from 'vite-plugin-taro-runtime/runtime/mini'

const supported = process.env.TARO_ENV === 'weapp'
const root = document.createElement('root')
root.enqueueUpdate = () => {}
const wrapper = document.createElement('custom-wrapper')
const child = document.createElement('view')
assert.equal(child._scope, supported ? null : undefined)
assert.equal(getNearestCtx(child), supported ? null : undefined)
root.appendChild(wrapper)
wrapper.appendChild(child)
const page = { page: 'first' }
const nextPage = { page: 'second' }
root.ctx = page
assert.strictEqual(root._scope, supported ? page : undefined)
assert.strictEqual(getNearestCtx(root), supported ? page : undefined)
// The context owner and read journal expose actual cache hits without changing its public value.
let context = null
const reads = []
Object.defineProperty(wrapper, 'ctx', {
    get() { reads.push(context); return context },
    set(value) { context = value }
})
assert.strictEqual(child._scope, supported ? page : undefined)
assert.strictEqual(getNearestCtx(child), supported ? page : undefined)
assert.equal(reads.length, supported ? 1 : 0)
const config = createRecursiveComponentConfig('custom-wrapper', false)
const [attached, detached] = hooks.call('getMiniLifecycleImpl').component
const component = { data: { i: { sid: wrapper.sid } }, props: { i: { sid: wrapper.sid } } }
const epoch = root.nearestCtxEpoch
config[attached].call(component)
assert.strictEqual(context, component)
assert.equal(root.nearestCtxEpoch - epoch, supported ? 1 : 0)
assert.strictEqual(child._scope, supported ? component : undefined)
assert.strictEqual(getNearestCtx(child), supported ? component : undefined)
assert.equal(reads.length, supported ? 2 : 0)
config[detached].call(component)
assert.equal(context, null)
assert.equal(root.nearestCtxEpoch - epoch, supported ? 2 : 0)
assert.strictEqual(child._scope, supported ? page : undefined)
assert.equal(reads.length, supported ? 3 : 0)
root.ctx = nextPage
assert.strictEqual(child._scope, supported ? page : undefined, 'cached template values refresh through invalidation')
invalidateNearestCtx(root)
assert.strictEqual(getNearestCtx(root), supported ? nextPage : undefined)
assert.strictEqual(getNearestCtx(child), supported ? nextPage : undefined)
assert.equal(reads.length, supported ? 4 : 0)
`
