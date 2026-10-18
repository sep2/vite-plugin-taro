import assert from 'node:assert/strict'
import test from 'node:test'
import { bundleRuntimeEntry, createExecutionContext, executeRuntimeEntry } from './runtime-entry-test-utils.ts'

test('WX host binds Page documents before mount and uses them for node creation', async () => {
    class LogicalNode {
        get ownerDocument(): object {
            return document
        }
    }
    class FormElement extends LogicalNode {}
    const document = {
        createElement(name: string) {
            const type = name.toLowerCase()
            return Object.assign(type === 'input' ? new FormElement() : new LogicalNode(), { nodeName: type })
        },
        createTextNode: (text: string) => Object.assign(new LogicalNode(), { nodeValue: text })
    }
    const bundle = await bundleRuntimeEntry({
        entry: 'wx/create-dom-host.ts',
        mocks: {
            'vite-plugin-taro-runtime/runtime/mini': `
                export const { document, FormElement } = globalThis.harness
                export const COMMENT = 'comment'
            `
        },
        defines: {}
    })
    const { createDomHost } = executeRuntimeEntry(bundle, createExecutionContext({ document, FormElement }))
    assert.ok(typeof createDomHost === 'function')
    const host = createDomHost()
    const app = {
        mount(component: unknown, id: string, ...callbacks: unknown[]) {
            assert.strictEqual(this, app)
            assert.notEqual(host.getPageRootType(id), 'root', 'the document is bound before mount')
            return [component, id, ...callbacks]
        },
        unmount(_id: string, complete?: () => void) {
            complete?.()
        }
    }
    host.bindApp(app, document.createElement('root'))
    const component = () => null
    const complete = () => undefined
    assert.deepEqual(app.mount(component, 'prerender', complete), [component, 'prerender', complete])
    const instance = { route: 'pages/same' }
    const getCtx = () => instance
    assert.deepEqual(app.mount(component, 'A', getCtx, complete), [component, 'A', getCtx, complete])
    app.mount(component, 'A', getCtx, complete)
    const type = host.getPageRootType('A')
    const parent = {}
    const page = host.getChildHostContext(parent, type)
    assert.strictEqual(host.getChildHostContext(page, 'view'), page)
    assert.strictEqual(Object.getPrototypeOf(page), document)
    const root = host.createElement(null, parent, type)
    const input = host.createElement(null, page, 'Input')
    const text = host.createText(null, page, 'text')
    assert.equal(root.nodeName, 'root')
    assert.equal(input.nodeName, 'input')
    assert.strictEqual(input.ownerDocument, page)
    assert.strictEqual(text.ownerDocument, page)
    assert.equal(Object.getOwnPropertyDescriptor(input, 'ownerDocument')?.writable, false)
    assert.strictEqual(page.createComment().ownerDocument, page)
    assert.equal(host.isFormElement(input), true)
    assert.equal(host.isFormElement(root), false)
    assert.strictEqual(host.createElement(null, parent, 'view').ownerDocument, document)
    assert.strictEqual(host.createText(null, parent, 'App text').ownerDocument, document)
    host.afterCommit(null)
    app.unmount('A', complete)
    assert.equal(host.getPageRootType('A'), 'root')
    assert.strictEqual(host.getChildHostContext(parent, type), parent)
    app.unmount('prerender', undefined)
})
