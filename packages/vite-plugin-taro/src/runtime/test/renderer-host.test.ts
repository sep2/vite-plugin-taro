import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
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

    setAttribute(name: string, value: unknown): void {
        this.attributes.set(name, value)
    }

    removeAttribute(name: string): void {
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
                            return `${await readFile(rendererPath, 'utf8')}\nexport { hostConfig };`
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
        const exports: { hostConfig?: HostConfig; getPageRootType?: (id: string) => string } = {}
        runInNewContext(chunk.code, {
            exports,
            rendererHost: host,
            global: {},
            // These probes call host operations directly and must not schedule React or native work.
            setTimeout() {
                assert.fail('Host-operation probes must be synchronous')
            },
            clearTimeout() {
                assert.fail('Host-operation probes must not own timers')
            }
        })
        const { hostConfig, getPageRootType } = exports
        assert.ok(hostConfig && getPageRootType)
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

        // Enable the optional selectors on this test-owned host and observe their receiver and exact context identity.
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
