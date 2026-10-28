import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createElement } from 'react'
import { build } from 'rolldown'
import { normalizePath, resolveConfig } from 'vite'
import type { RendererHost } from 'vite-plugin-taro-runtime/react'
import vpt from '../../index.ts'
import { rendererHostId } from '../../node/plugins/mini/module/module.ts'
import { resolveTaroRuntime } from '../../node/utils/packages.ts'

class Element {
    // Record host mutations independently of Taro's prototypes and native scheduling.
    readonly attributes = new Map<string, unknown>()
    // Logical style assignments exercise the renderer's synchronous host boundary.
    readonly style: Record<string, unknown> = {}
    // Count native writes to ensure omitted elements never add redundant host work.
    readonly writes: string[] = []

    setAttribute(name: string, value: unknown): void {
        this.writes.push(`set:${name}`)
        this.attributes.set(name, value)
    }

    removeAttribute(name: string): void {
        this.writes.push(`remove:${name}`)
        this.attributes.delete(name)
    }
}

type Text = { nodeValue: string }
type Props = Record<string, unknown>
type HostConfig = {
    getChildHostContext(parent: object, type: string): object
    createInstance(type: string, props: Props, container: object, context: object, fiber: object): Element
    createTextInstance(text: string, container: object, context: object, fiber: object): Text
    finalizeInitialChildren(element: Element, type: string, props: Props): boolean
    commitUpdate(element: Element, type: string, previous: Props, next: Props): void
    commitTextUpdate(text: Text, previous: string, next: string): void
    getPublicInstance(element: Element): Element
    resetAfterCommit(container: object): void
}

for (const mode of ['development', 'production']) {
    test(`${mode}: the shared renderer delegates Page types, contexts, creation and commit work`, async () => {
        const config = await resolveConfig(
            {
                configFile: false,
                plugins: vpt({ target: 'wx', app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
            },
            'build'
        )
        const rendererPath = resolveTaroRuntime('react')
        const result = await build({
            input: rendererPath,
            plugins: [
                {
                    name: 'test:renderer-host',
                    resolveId(id) {
                        if (id === rendererHostId) {
                            return id
                        }
                        if (id === '@tarojs/runtime') {
                            return resolveTaroRuntime('runtime/mini')
                        }
                    },
                    async load(id) {
                        if (normalizePath(id) === normalizePath(rendererPath)) {
                            return `${await readFile(rendererPath, 'utf8')}\nexport { hostConfig, setProperty };`
                        }
                        if (id === rendererHostId) {
                            return 'export default globalThis.rendererHost'
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
            output: { format: 'cjs', exports: 'named' },
            write: false
        })
        const chunk = result.output[0]
        assert.ok(chunk?.type === 'chunk')
        const element = new Element()
        const text: Text = { nodeValue: 'host text' }
        // Test-owned classification can change without changing the node's class or the renderer instance.
        const forms = new Set<Element>([element])
        // Record exact operation arguments to check ownership and synchronous commit forwarding.
        const calls: { name: string; args: unknown[] }[] = []
        const host: RendererHost<object, object, Element, Text> = {
            getPageRootType() {
                return 'root'
            },
            getChildHostContext(parent) {
                return parent
            },
            createElement(container, context, type) {
                calls.push({ name: 'element', args: [container, context, type] })
                return element
            },
            createText(container, context, value) {
                calls.push({ name: 'text', args: [container, context, value] })
                return text
            },
            isFormElement(node) {
                return forms.has(node)
            },
            batchStyleUpdate(_element, update) {
                update()
            },
            afterCommit(container) {
                calls.push({ name: 'commit', args: [container] })
            }
        }
        const exports: {
            hostConfig?: HostConfig
            getPageRootType?: (id: string) => string
            setProperty?: (dom: Element, name: string, value: unknown, oldValue: unknown) => void
        } = {}
        // Capture diagnostics without logging React elements or their owner graphs.
        const warnings: unknown[][] = []
        runInNewContext(chunk.code, {
            exports,
            rendererHost: host,
            global: {},
            console: { ...console, info() {}, warn: (...args: unknown[]) => warnings.push(args) },
            // These probes call host operations directly and must not schedule React or native work.
            setTimeout() {
                assert.fail('Host-operation probes must be synchronous')
            },
            clearTimeout() {
                assert.fail('Host-operation probes must not own timers')
            }
        })
        const { hostConfig, getPageRootType, setProperty } = exports
        assert.ok(hostConfig && getPageRootType && setProperty)
        checkReactElementAttributes(hostConfig, warnings, mode)
        if (mode === 'production') {
            assert.doesNotMatch(setProperty.toString(), /isValidElement|console\.warn|React element ignored/)
            assert.doesNotMatch(chunk.code, /React element ignored for host attribute/)
        }
        const container = { name: 'first root' }
        const context = { name: 'first context' }
        const otherContainer = { name: 'second root' }
        const otherContext = { name: 'second context' }
        assert.equal(getPageRootType('page-id'), 'root')
        assert.strictEqual(hostConfig.getChildHostContext(context, 'root'), context)
        assert.strictEqual(hostConfig.createInstance('view', {}, container, context, {}), element)
        assert.strictEqual(hostConfig.getPublicInstance(element), element)
        assert.strictEqual(hostConfig.createTextInstance('requested text', otherContainer, otherContext, {}), text)
        assert.deepEqual(calls, [
            { name: 'element', args: [container, context, 'view'] },
            { name: 'text', args: [otherContainer, otherContext, 'requested text'] }
        ])
        assert.strictEqual(calls[0].args[0], container)
        assert.strictEqual(calls[0].args[1], context)
        assert.strictEqual(calls[1].args[0], otherContainer)
        assert.strictEqual(calls[1].args[1], otherContext)
        hostConfig.commitTextUpdate(text, 'host text', 'updated text')
        assert.equal(text.nodeValue, 'updated text')

        assert.equal(hostConfig.finalizeInitialChildren(element, 'view', { defaultValue: 'seed' }), false)
        assert.equal(element.attributes.get('value'), 'seed')
        assert.equal(element.attributes.has('defaultValue'), false)
        const props = { value: 'controlled' }
        element.setAttribute('value', 'native edit')
        hostConfig.commitUpdate(element, 'view', props, props)
        assert.equal(element.attributes.get('value'), 'controlled', 'host-classified forms reapply equal value props')

        forms.clear()
        element.setAttribute('value', 'ordinary attribute')
        hostConfig.commitUpdate(element, 'view', props, props)
        assert.equal(element.attributes.get('value'), 'ordinary attribute', 'ordinary nodes retain equal props')
        hostConfig.finalizeInitialChildren(element, 'view', { defaultValue: 'ordinary default' })
        assert.equal(element.attributes.get('defaultValue'), 'ordinary default')
        assert.equal(element.attributes.get('value'), 'ordinary attribute')

        hostConfig.resetAfterCommit(container)
        hostConfig.resetAfterCommit(otherContainer)
        assert.deepEqual(calls.slice(2), [
            { name: 'commit', args: [container] },
            { name: 'commit', args: [otherContainer] }
        ])
        assert.strictEqual(calls[2].args[0], container)
        assert.strictEqual(calls[3].args[0], otherContainer)

        // Page-specific selectors retain their host receiver and exact context identity.
        Object.assign(host, {
            getPageRootType(id: string) {
                assert.strictEqual(this, host)
                return `test-page:${id}`
            },
            getChildHostContext(parent: object, type: string) {
                assert.strictEqual(this, host)
                return type === 'test-page:page-id' ? otherContext : parent
            }
        })
        const type = getPageRootType('page-id')
        assert.equal(type, 'test-page:page-id')
        const selected = hostConfig.getChildHostContext(context, type)
        assert.strictEqual(selected, otherContext)
        assert.strictEqual(hostConfig.getChildHostContext(selected, 'view'), selected)
        hostConfig.createInstance('view', {}, container, selected, {})
        hostConfig.createTextInstance('scoped text', container, selected, {})
        assert.strictEqual(calls[4].args[1], selected)
        assert.strictEqual(calls[5].args[1], selected)

        hostConfig.finalizeInitialChildren(element, 'view', { style: { color: 'red', width: 2 } })
        assert.deepEqual(element.style, { color: 'red', width: '2px' })
        // This host-owned scope observes logical values before/after the exact callback, in the same stack.
        const scopes: unknown[] = []
        Object.assign(host, {
            batchStyleUpdate(node: Element, update: () => void) {
                assert.strictEqual(this, host)
                assert.strictEqual(node, element)
                scopes.push({ ...node.style })
                try {
                    update()
                } finally {
                    scopes.push({ ...node.style })
                }
            }
        })
        hostConfig.commitUpdate(element, 'view', { style: { color: 'red', width: 2 } }, { style: { color: 'blue' } })
        assert.deepEqual(scopes, [
            { color: 'red', width: '2px' },
            { color: 'blue', width: '' }
        ])
        const error = new Error('style application failed')
        assert.throws(
            () =>
                hostConfig.commitUpdate(
                    element,
                    'view',
                    {},
                    {
                        style: {
                            color: 'green',
                            get height() {
                                throw error
                            }
                        }
                    }
                ),
            (thrown) => thrown === error
        )
        assert.deepEqual(scopes.slice(2), [
            { color: 'blue', width: '' },
            { color: 'green', width: '' }
        ])
    })
}

function checkReactElementAttributes(host: HostConfig, warnings: unknown[][], mode: string): void {
    const development = mode === 'development'
    const node = new Element()
    const first = createElement('text', null, 'first')
    const second = createElement('text', null, 'second')
    // Property traps prove that the hot path only reads the React tag, never props, owners or nested data.
    const reads: PropertyKey[] = []
    const opaque = new Proxy(
        {},
        {
            get(_target, key) {
                reads.push(key)
                assert.equal(key, '$$typeof')
                return undefined
            },
            ownKeys() {
                assert.fail('Host attributes must not be traversed')
            }
        }
    )
    const values = [
        'text',
        0,
        false,
        opaque,
        { nested: { value: 1 } },
        [1, 2],
        { _owner: 'business data' },
        { $$typeof: 'business data' },
        { $$typeof: Symbol('react.transitional.element') }
    ]
    for (const value of values) {
        host.finalizeInitialChildren(node, 'view', { payload: value })
        assert.strictEqual(node.attributes.get('payload'), value)
    }
    assert.deepEqual(reads, development ? ['$$typeof'] : [])
    assert.equal(warnings.length, 0)

    node.writes.length = 0
    host.finalizeInitialChildren(node, 'view', { value: first, children: first, ref: first, key: first })
    assert.deepEqual(node.writes, development ? [] : ['set:value'])
    assert.strictEqual(node.attributes.get('value'), development ? undefined : first)
    assert.equal(warnings.length, development ? 1 : 0)

    host.commitUpdate(node, 'view', { value: first }, { value: second })
    assert.deepEqual(node.writes, development ? [] : ['set:value', 'set:value'])
    assert.strictEqual(node.attributes.get('value'), development ? undefined : second)
    assert.equal(warnings.length, development ? 1 : 0, 'consecutive elements do not repeat diagnostics')

    host.commitUpdate(node, 'view', { value: second }, { value: 'restored' })
    assert.equal(node.attributes.get('value'), 'restored')
    for (const previous of ['restored', 0, false, '']) {
        host.commitUpdate(node, 'view', {}, { value: previous })
        node.writes.length = 0
        host.commitUpdate(node, 'view', { value: previous }, { value: first })
        assert.deepEqual(node.writes, [development ? 'remove:value' : 'set:value'])
        assert.strictEqual(node.attributes.get('value'), development ? undefined : first)
    }
    assert.equal(warnings.length, development ? 5 : 0)
    for (const warning of warnings) {
        assert.equal(warning.length, 1)
        assert.equal(typeof warning[0], 'string')
        assert.match(String(warning[0]), /React element ignored for host attribute "value"/)
    }

    host.commitUpdate(node, 'view', { value: first }, {})
    assert.equal(node.attributes.has('value'), false)
    host.commitUpdate(node, 'view', {}, { value: second })
    host.commitUpdate(node, 'view', { value: second }, { value: null })
    assert.equal(node.attributes.has('value'), false)
    host.commitUpdate(node, 'view', {}, { value: undefined, callback: () => {} })
    assert.equal(node.attributes.has('value'), false)
    assert.equal(node.attributes.has('callback'), false)

    host.finalizeInitialChildren(node, 'view', { className: 'previous' })
    host.commitUpdate(node, 'view', { className: 'previous' }, { className: first })
    assert.strictEqual(node.attributes.get('class'), development ? undefined : first)
}
