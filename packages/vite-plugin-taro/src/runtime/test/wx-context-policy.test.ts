import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { resolveConfig } from 'vite'
import vpt from '../../index.ts'
import { rendererHostId } from '../../node/plugins/mini/module/module.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../node/utils/packages.ts'
import { createWxTestRoot } from './create-wx-test-root.ts'

const require = createRequire(import.meta.url)

for (const mode of ['development', 'production']) {
    test(`WX context policy (${mode}): native nodes disable template scope lookup`, async () => {
        const config = await resolveConfig(
            {
                configFile: false,
                plugins: vpt({ target: 'wx', app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
            },
            'build'
        )
        const entry = 'test:wx-context-policy'
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
                    load(id) {
                        if (id === entry) {
                            return fixture
                        }
                        if (id === rendererHostId) {
                            return `import { createDomHost } from ${JSON.stringify(resolveVptRuntime('wx/create-dom-host'))}
                            export default createDomHost(instance => instance.root)`
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
                assert.fail('Context operations must be synchronous and must not schedule template work')
            },
            clearTimeout() {
                assert.fail('Context operations must not own timers')
            }
        })
    })
}

const fixture = `
import assert from 'node:assert/strict'
import { hooks } from '@tarojs/shared'
import 'vite-plugin-taro-runtime/plugin-platform-weapp/runtime'
import { Current, createRecursiveComponentConfig, document, getNearestCtx, TaroNode } from 'vite-plugin-taro-runtime/runtime/mini'
import host from '\\0vpt:renderer-host'

const app = Current.app = { mount() {}, unmount() {} }
const appRoot = document.createElement('root')
host.bindApp(app, appRoot)
const nativePage = { root: globalThis.sdk }
host.createPage(() => null, { path: 'page', prerender: false }).lifetimes.attached.call(nativePage)
const type = host.getPageRootType(nativePage.$taroPath)
const context = host.getChildHostContext({}, type)
const root = host.createElement(null, {}, type)
function element(type) { return host.createElement(root, context, type) }
const parent = element('view')
const leaf = element('view')
const anchor = element('view')
const text = host.createText(root, context, 'text')
const comment = document.createComment('comment')
leaf.appendChild(text)
root.appendChild(parent)

// The journal catches root walks from native mutations, scope queries and context lifecycle callbacks.
const reads = []
const rootGetter = Object.getOwnPropertyDescriptor(TaroNode.prototype, '_root').get
for (const node of [parent, leaf, text, comment]) {
    Object.defineProperty(node, '_root', {
        get() { reads.push(node); return rootGetter.call(this) }
    })
}
function checkScopes() {
    for (const node of [document, appRoot, root, parent, leaf, text, comment]) {
        assert.equal(node._scope, undefined, node.nodeName)
        assert.equal(getNearestCtx(node), undefined, node.nodeName)
    }
    assert.deepEqual(reads, [], 'native context operations must not resolve roots')
}
checkScopes()
const epoch = root.nearestCtxEpoch
parent.appendChild(leaf)
parent.appendChild(anchor)
parent.insertBefore(anchor, leaf)
parent.replaceChild(element('view'), anchor)
parent.removeChild(parent.firstChild)
checkScopes()
assert.equal(root.nearestCtxEpoch, epoch)

root.ctx = { page: 'first' }
parent.ctx = { component: 'first' }
leaf.ctx = { component: 'leaf' }
checkScopes()
parent.ctx = { component: 'second' }
checkScopes()
leaf.ctx = null
parent.ctx = null
root.ctx = null
checkScopes()
root.ctx = { page: 'second' }

const other = element('view')
other.ctx = { component: 'other' }
root.appendChild(other)
other.appendChild(leaf)
checkScopes()
other.removeChild(leaf)
checkScopes()
parent.appendChild(leaf)
checkScopes()

// Native component ownership still binds and clears ctx while template scope APIs stay disabled.
const wrapper = element('custom-wrapper')
root.appendChild(wrapper)
wrapper.appendChild(leaf)
Object.defineProperty(wrapper, '_root', {
    get() { reads.push(wrapper); return rootGetter.call(this) }
})
const config = createRecursiveComponentConfig('custom-wrapper', false)
const [attached, detached] = hooks.call('getMiniLifecycleImpl').component
const component = { data: { i: { sid: wrapper.sid } } }
config[attached].call(component)
assert.strictEqual(wrapper.ctx, component)
assert.equal(wrapper._scope, undefined)
assert.equal(getNearestCtx(wrapper), undefined)
checkScopes()
config[detached].call(component)
assert.equal(wrapper.ctx, null)
checkScopes()
assert.equal(root.nearestCtxEpoch, epoch)
`
