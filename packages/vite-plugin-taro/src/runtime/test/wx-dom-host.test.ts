import assert from 'node:assert/strict'
import test from 'node:test'
import { createWxTestRoot } from './create-wx-test-root.ts'
import { bundleRuntimeEntry, createExecutionContext, executeRuntimeEntry } from './runtime-entry-test-utils.ts'

test('WX host creates, mutates and detaches Page-owned native nodes', async (t) => {
    function extend(ctor: { prototype: object }, name: string, method: object): void {
        Object.defineProperty(ctor.prototype, name, { value: method, enumerable: true, configurable: true })
    }
    class TaroNode {
        delegateChildInsertion() {}
        delegateChildRemoval() {}
        get ownerDocument(): object {
            return document
        }
        static extend(name: string, method: object): void {
            extend(TaroNode, name, method)
        }
    }
    class Style {
        cssText = ''
        readonly _element: TaroNode
        constructor(element: TaroNode) {
            this._element = element
        }
    }
    class TaroElement extends TaroNode {
        style = new Style(this)
        static override extend(name: string, method: object): void {
            extend(TaroElement, name, method)
        }
    }
    const flush = t.mock.fn()
    class TaroRootElement extends TaroElement {
        flushUpdateCallback = flush
    }
    class TaroText extends TaroNode {}
    class FormElement extends TaroElement {}
    const document = {
        createElement(name: string) {
            const type = name.toLowerCase()
            return Object.assign(
                type === 'root' ? new TaroRootElement() : type === 'input' ? new FormElement() : new TaroElement(),
                { nodeName: type }
            )
        },
        createTextNode: (text: string) => Object.assign(new TaroText(), { nodeValue: text })
    }
    const sync = t.mock.fn((callback: () => unknown) => callback())
    const bundle = await bundleRuntimeEntry({
        entry: 'wx/create-dom-host.ts',
        mocks: {
            '@tarojs/shared': `export const noop = () => {}; export function ensure(value, message) { if (!value) throw new Error(message) }`,
            'vite-plugin-taro-runtime/react': 'export const flushSync = globalThis.harness.sync',
            'vite-plugin-taro-runtime/runtime/mini': `
                export const { document, extend, FormElement, Style, TaroElement, TaroNode, TaroRootElement, TaroText } = globalThis.harness
                export const COMMENT = 'comment'
            `
        },
        defines: {}
    })
    const { createDomHost } = executeRuntimeEntry(
        bundle,
        createExecutionContext({
            document,
            extend,
            FormElement,
            Style,
            TaroElement,
            TaroNode,
            TaroRootElement,
            TaroText,
            sync
        })
    )
    assert.ok(typeof createDomHost === 'function')
    const sdk = createWxTestRoot()
    const instance = { root: sdk }
    const getRoot = t.mock.fn((instance: { root: typeof sdk }) => instance.root)
    const host = createDomHost(getRoot)
    const app = {
        mount(component: unknown, id: string, ...callbacks: unknown[]) {
            assert.strictEqual(this, app)
            assert.notEqual(host.getPageRootType(id), 'root')
            return [component, id, ...callbacks]
        },
        unmount(_id: string, complete?: () => void) {
            complete?.()
        }
    }
    host.bindApp(app, document.createElement('root'))
    const component = () => null
    const complete = t.mock.fn()
    const getCtx = () => instance
    assert.throws(() => app.mount(component, 'prerender', complete), /native Page context/)
    assert.deepEqual(app.mount(component, 'A', getCtx, complete), [component, 'A', getCtx, complete])
    app.mount(component, 'A', getCtx, complete)
    assert.equal(getRoot.mock.callCount(), 1)
    assert.strictEqual(getRoot.mock.calls[0]?.arguments[0], instance)
    const parent = {}
    const type = host.getPageRootType('A')
    const page = host.getChildHostContext(parent, type)
    assert.strictEqual(host.getChildHostContext(page, 'view'), page)
    assert.strictEqual(Object.getPrototypeOf(page), document)
    const root = host.createElement(null, parent, type)
    const view = host.createElement(null, page, 'View')
    const text = host.createText(null, page, 'first')
    const comment = page.createComment()
    assert.strictEqual(text.ownerDocument, page)
    assert.equal(Object.getOwnPropertyDescriptor(view, 'ownerDocument')?.writable, false)
    assert.equal(Object.getOwnPropertyDescriptor(view, 'nativeNode')?.writable, false)
    assert.strictEqual(view.nativeNode.ownerShadowRoot, sdk)
    assert.strictEqual(text.nativeNode.ownerShadowRoot, sdk)
    assert.strictEqual(comment.nativeNode.ownerShadowRoot, sdk)
    assert.equal(comment.nodeName, 'comment')
    const secondSdk = createWxTestRoot()
    app.mount(component, 'B', () => ({ root: secondSdk }), complete)
    const secondPage = host.getChildHostContext(parent, host.getPageRootType('B'))
    const secondView = secondPage.createElement('view')
    const secondText = secondPage.createTextNode('second')
    assert.strictEqual(secondView.nativeNode.ownerShadowRoot, secondSdk)
    assert.strictEqual(secondText.nativeNode.ownerShadowRoot, secondSdk)
    assert.strictEqual(view.delegateChildInsertion, secondView.delegateChildInsertion)
    assert.strictEqual(view.delegateAttributeUpdate, secondView.delegateAttributeUpdate)
    assert.strictEqual(view.style.delegateStyleUpdate, secondView.style.delegateStyleUpdate)
    assert.strictEqual(text.delegateTextUpdate, secondText.delegateTextUpdate)
    assert.strictEqual(root.performUpdate, secondPage.createElement('root').performUpdate)
    assert.equal(Object.hasOwn(view, 'delegateChildInsertion'), false)
    assert.equal(Object.hasOwn(text, 'delegateTextUpdate'), false)
    assert.equal(Object.hasOwn(root, 'performUpdate'), false)
    // Logical App/document elements share the prototypes but have no SDK presentation.
    const logical = host.createElement(null, parent, 'vpt_page_outlet')
    Object.getPrototypeOf(logical).delegateChildInsertion.call(logical, text, null)
    Object.getPrototypeOf(logical).delegateChildRemoval.call(logical, text)
    logical.delegateAttributeUpdate('id', 'logical')
    logical.delegateAttributeRemoval('id')
    logical.style.delegateStyleUpdate()
    root.delegateChildInsertion(view, null)
    view.delegateChildInsertion(text, null)
    view.delegateChildInsertion(comment, text)
    root.performUpdate(true, complete)
    const nativeRoot = sdk.childNodes[0]!
    const nativeView = nativeRoot.childNodes[0]!
    assert.strictEqual(root.nativeNode, nativeRoot)
    assert.strictEqual(view.nativeNode, nativeView)
    assert.equal(nativeRoot.name, 'view')
    assert.deepEqual(
        nativeView.childNodes.map((node) => node.textContent),
        ['', 'first']
    )
    view.delegateChildInsertion(comment, null)
    assert.deepEqual(
        nativeView.childNodes.map((node) => node.textContent),
        ['first', '']
    )
    text.delegateTextUpdate('updated')
    assert.equal(nativeView.childNodes[0]!.textContent, 'updated')
    view.delegateChildRemoval(comment)
    assert.equal(nativeView.childNodes.length, 1)
    view.delegateChildReset()
    view.delegateEventUpdate()
    view.delegateAttributeUpdate('id', 'panel')
    view.delegateAttributeUpdate('class', 'active')
    view.delegateAttributeUpdate('data-state', 7)
    view.delegateAttributeUpdate('style', 'handled by Style')
    view.style.cssText = 'color: red;'
    view.style.delegateStyleUpdate()
    assert.equal(nativeView.id, 'panel')
    assert.equal(nativeView.className, 'active')
    assert.equal(nativeView.attributes['data-state'], 7)
    assert.equal(nativeView.style, 'color: red;')
    view.delegateAttributeRemoval('id')
    view.delegateAttributeRemoval('class')
    view.delegateAttributeRemoval('data-state')
    view.delegateAttributeRemoval('style')
    assert.equal(nativeView.id, '')
    assert.equal(nativeView.className, '')
    assert.deepEqual(nativeView.attributes, {})
    root.performUpdate(true)
    root.performUpdate(false)
    root.enqueueUpdate({})
    assert.equal(sdk.childNodes.length, 1)
    assert.equal(flush.mock.callCount(), 3)
    assert.equal(host.isFormElement(page.createElement('input')), true)
    assert.equal(host.isFormElement(view), false)
    assert.throws(() => host.createElement(null, parent, 'view'), /Page document/)
    assert.throws(() => host.createText(null, parent, 'text'), /Page document/)
    const outlet = host.createElement(null, parent, 'vpt_page_outlet')
    outlet.delegateChildInsertion(root)
    outlet.delegateChildRemoval(root, { cleanRef: false })
    assert.equal(sdk.childNodes.length, 1)
    outlet.delegateChildRemoval(root, {})
    outlet.delegateChildRemoval(root, {})
    outlet.delegateChildReset()
    assert.equal(sdk.childNodes.length, 0)
    host.afterCommit(null)
    app.unmount('A', complete)
    assert.equal(host.getPageRootType('A'), 'root')
    assert.strictEqual(host.getChildHostContext(parent, type), parent)
    app.unmount('A')
    assert.equal(sync.mock.callCount(), 2)
})
