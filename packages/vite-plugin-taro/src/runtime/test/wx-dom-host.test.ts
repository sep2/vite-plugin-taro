import assert from 'node:assert/strict'
import test from 'node:test'
import { toCamelCase, toDashed } from '@tarojs/shared'
import { createWxTestRoot } from './create-wx-test-root.ts'
import { bundleRuntimeEntry, createExecutionContext, executeRuntimeEntry } from './runtime-entry-test-utils.ts'

test('WX host creates, mutates and detaches Page-owned native nodes', async (t) => {
    function extend(ctor: { prototype: object }, name: string, method: object): void {
        Object.defineProperty(ctor.prototype, name, {
            enumerable: true,
            configurable: true,
            ...(typeof method === 'function' ? { value: method } : method)
        })
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
        readonly sid = 'logical-node'
        // Logical handler arrays expose upstream HTML event aliases to the host.
        readonly __handlers: Record<string, unknown[]> = {}
        // Attribute removal updates the event-facing dataset alongside the SDK metadata.
        readonly dataset: Record<string, unknown> = {}
        style = new Style(this)
        getEventHandlers(type: string): unknown[] | undefined {
            return this.__handlers[type]
        }
        static override extend(name: string, method: object): void {
            extend(TaroElement, name, method)
        }
    }
    const flush = t.mock.fn()
    class TaroRootElement extends TaroElement {
        flushUpdateCallback = flush
    }
    class TaroText extends TaroNode {}
    class TaroEvent {}
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
    const dispatch = t.mock.fn((event: unknown, node: unknown) => ({ event, node }))
    const bundle = await bundleRuntimeEntry({
        entry: 'wx/create-dom-host.ts',
        mocks: {
            '@tarojs/shared': `export const noop = () => {}; export const { toCamelCase, toDashed } = globalThis.harness; export function ensure(value, message) { if (!value) throw new Error(message) }`,
            'vite-plugin-taro-runtime/react': 'export const flushSync = globalThis.harness.sync',
            'vite-plugin-taro-runtime/runtime/mini': `
                export const { document, extend, FormElement, Style, TaroElement, TaroEvent, TaroNode, TaroRootElement, TaroText } = globalThis.harness
                export const COMMENT = 'comment'
                export const eventHandler = globalThis.harness.dispatch
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
            TaroEvent,
            TaroNode,
            TaroRootElement,
            TaroText,
            dispatch,
            sync,
            toCamelCase,
            toDashed
        })
    )
    assert.ok(typeof createDomHost === 'function')
    const sdk = createWxTestRoot()
    const createVirtualNode = t.mock.method(sdk, 'createVirtualNode')
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
    assert.equal(root.nativeNode.isVirtual(), true, 'Page roots must preserve the native Page layout')
    assert.deepEqual(createVirtualNode.mock.calls[0]?.arguments, ['root'])
    const view = host.createElement(null, page, 'View')
    assert.equal(view.nativeNode.isVirtual(), false)
    const text = host.createText(null, page, 'first')
    const comment = page.createComment()
    assert.strictEqual(text.ownerDocument, page)
    assert.equal(Object.getOwnPropertyDescriptor(view, 'ownerDocument')?.writable, false)
    assert.equal(Object.getOwnPropertyDescriptor(view, 'nativeNode')?.writable, false)
    assert.strictEqual(view.nativeNode.ownerShadowRoot, sdk)
    assert.strictEqual(text.nativeNode.ownerShadowRoot, sdk)
    assert.strictEqual(comment.nativeNode.ownerShadowRoot, sdk)
    assert.equal(comment.nodeName, 'comment')
    const secondSdk = createWxTestRoot({
        'custom-card': {
            label: () => 'ready',
            enabled: () => true,
            count: () => 9,
            payload: () => ({ version: 1 })
        }
    })
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
    logical.delegateEventListener('tap', true)
    // SDK template bindings require the owning Page's shadow root.
    assert.throws(
        () => logical.delegateEventListener.call({ nativeNode: sdk }, 'tap', true),
        /ownerShadowRoot should not be empty/
    )
    assert.deepEqual(sdk.listeners, {})
    root.delegateChildInsertion(view, null)
    view.delegateChildInsertion(text, null)
    view.delegateChildInsertion(comment, text)
    root.performUpdate(true, complete)
    const nativeRoot = sdk.childNodes[0]!
    const nativeView = nativeRoot.childNodes[0]!
    assert.strictEqual(root.nativeNode, nativeRoot)
    assert.strictEqual(view.nativeNode, nativeView)
    assert.equal(nativeRoot.name, 'root')
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
    const bindProperty = t.mock.method(sdk.getHostNode().templateInstance.procGenWrapper, 'r')
    for (const { type, name, value, attribute } of [
        { type: 'view', name: 'hoverClass', value: '', attribute: 'hover-class' },
        { type: 'view', name: 'hover-stop-propagation', value: true, attribute: 'hover-stop-propagation' },
        { type: 'view', name: 'hoverStartTime', value: 0, attribute: 'hover-start-time' },
        { type: 'view', name: 'hoverStayTime', value: 20, attribute: 'hover-stay-time' },
        { type: 'button', name: 'hoverClass', value: 'pressed', attribute: 'hover-class' },
        { type: 'progress', name: 'activeColor', value: 'blue', attribute: 'active-color' },
        { type: 'rich-text', name: 'nodes', value: [{ type: 'text', text: 'hello' }], attribute: 'nodes' },
        { type: 'video', name: 'controls', value: false, attribute: 'controls' },
        { type: 'input', name: 'type', value: 'number', attribute: 'type' },
        { type: 'text', name: 'space', value: 'nbsp', attribute: 'space' },
        { type: 'view', name: 'ariaRole', value: 'button', attribute: 'aria-role' }
    ]) {
        const element = page.createElement(type)
        const remove = t.mock.method(element.nativeNode, 'removeAttribute')
        element.delegateAttributeUpdate(name, value)
        assert.deepEqual(bindProperty.mock.calls.at(-1)?.arguments, [element.nativeNode, attribute, value])
        assert.strictEqual(element.nativeNode.attributes[attribute], value)
        element.delegateAttributeRemoval(name)
        assert.deepEqual(remove.mock.calls[0]?.arguments, [attribute])
        assert.equal(Object.hasOwn(element.nativeNode.attributes, attribute), false)
    }
    const ownPageBindings = bindProperty.mock.callCount()
    const card = secondPage.createElement('custom-card')
    const group = card.nativeNode._$dataGroup
    const finish = t.mock.method(
        secondSdk.getHostNode().templateInstance.procGenWrapper,
        'endBindingMapUpdateForElement'
    )
    const bindComponentProperty = t.mock.method(secondSdk.getHostNode().templateInstance.procGenWrapper, 'r')
    for (const [name, value] of [
        ['label', 'changed'],
        ['enabled', false],
        ['count', 8],
        ['payload', { version: 2 }]
    ] as const) {
        card.delegateAttributeUpdate(name, value)
        assert.deepEqual(group.data[name], value)
        card.delegateAttributeRemoval(name)
        assert.deepEqual(bindComponentProperty.mock.calls.at(-1)?.arguments, [card.nativeNode, name, undefined])
        assert.equal(group.data[name], undefined)
    }
    assert.equal(finish.mock.callCount(), 8)
    for (const call of finish.mock.calls) {
        assert.deepEqual(call.arguments, [card.nativeNode])
    }
    assert.equal(group.pending.length, 0)
    assert.deepEqual(card.nativeNode.attributes, {})
    assert.equal(bindProperty.mock.callCount(), ownPageBindings)

    const bindClass = t.mock.method(sdk.getHostNode().templateInstance.procGenWrapper, 'c')
    view.delegateAttributeUpdate('id', 'panel')
    view.delegateAttributeUpdate('class', 'active shared')
    view.delegateAttributeUpdate('data-state', 7)
    view.delegateAttributeUpdate('style', 'handled by Style')
    view.style.cssText = 'color: red;'
    view.style.delegateStyleUpdate()
    assert.equal(nativeView.id, 'panel')
    assert.equal(nativeView.class, 'active shared')
    assert.deepEqual(bindClass.mock.calls[0]?.arguments, [nativeView, 'active shared'])
    view.delegateAttributeUpdate('class', 'updated')
    secondView.delegateAttributeUpdate('class', 'second')
    assert.equal(nativeView.class, 'updated')
    assert.equal(secondView.nativeNode.class, 'second')
    assert.equal(bindClass.mock.callCount(), 2)
    assert.deepEqual(bindClass.mock.calls[1]?.arguments, [nativeView, 'updated'])
    assert.equal(nativeView.dataset.state, 7)
    assert.equal(Object.hasOwn(nativeView.attributes, 'data-state'), false)
    const payload = { id: 1 }
    view.delegateAttributeUpdate('data-user-id', payload)
    assert.strictEqual(nativeView.dataset.userId, payload)
    view.dataset.userId = payload
    view.delegateAttributeRemoval('data-user-id')
    assert.equal(nativeView.dataset.userId, undefined)
    assert.equal(Object.hasOwn(view.dataset, 'userId'), false)
    view.delegateAttributeUpdate('title', 'panel')
    assert.equal(nativeView.attributes.title, 'panel')
    assert.equal(nativeView.style, 'color: red;')
    secondView.style.cssText = 'color: green;'
    secondView.style.delegateStyleUpdate()
    for (const cssText of ['width: 120rpx; color: blue;', 'width: 120rpx;', '', 'color: red;']) {
        view.style.cssText = cssText
        view.style.delegateStyleUpdate()
        assert.equal(nativeView.style, cssText)
        assert.equal(secondView.nativeNode.style, 'color: green;')
        assert.equal(nativeView.class, 'updated')
    }
    assert.equal(Object.hasOwn(nativeView.dataset, 'sid'), false)
    const bind = t.mock.method(sdk.getHostNode().templateInstance.procGenWrapper, 'v')
    view.delegateEventListener('tap', true)
    assert.deepEqual(bind.mock.calls[0]?.arguments, [
        nativeView,
        'tap',
        bind.mock.calls[0]?.arguments[2],
        false,
        false,
        false,
        true
    ])
    const listener = nativeView.listeners.tap![0]!
    // An unrelated SDK listener retains its own subscription across VPT's dynamic updates.
    const observer = t.mock.fn()
    nativeView.addListener('tap', observer)
    nativeView.removeListener('tap', () => {})
    nativeView.removeListener('other', listener)
    assert.deepEqual(nativeView.listeners.tap, [listener, observer])
    const sdkEvent = {
        type: 'tap',
        timeStamp: 456,
        detail: { x: 10 },
        target: { id: 'panel', dataset: nativeView.dataset },
        currentTarget: { id: 'panel', dataset: nativeView.dataset },
        mark: { section: 'view' },
        touches: [{ identifier: 1 }],
        sdkExtension: { retained: true }
    }
    const result = listener(sdkEvent)
    assert.strictEqual(dispatch.mock.calls[0]?.arguments[0], sdkEvent)
    assert.strictEqual(dispatch.mock.calls[0]?.arguments[1], view)
    assert.deepEqual(result, { event: sdkEvent, node: view })
    view.delegateEventListener('tap', false)
    assert.deepEqual(bind.mock.calls[1]?.arguments, [nativeView, 'tap', null, false, false, false, true])
    assert.deepEqual(nativeView.listeners.tap, [observer])
    view.delegateEventListener('tap', true)
    assert.equal(nativeView.listeners.tap!.length, 2)
    nativeView.tap({})
    assert.equal(dispatch.mock.callCount(), 2)
    assert.equal(observer.mock.callCount(), 1)
    view.delegateEventListener('tap', false)
    nativeView.tap({})
    secondView.nativeNode.tap({})
    assert.equal(dispatch.mock.callCount(), 2)
    assert.equal(observer.mock.callCount(), 2)
    nativeView.removeListener('tap', observer)
    view.delegateAttributeRemoval('id')
    view.delegateAttributeRemoval('class')
    view.delegateAttributeRemoval('data-state')
    view.delegateAttributeRemoval('title')
    view.delegateAttributeRemoval('style')
    assert.equal(nativeView.dataset.state, undefined)
    assert.equal(nativeView.id, '')
    assert.equal(nativeView.class, '')
    assert.deepEqual(bindClass.mock.calls[2]?.arguments, [nativeView, ''])
    assert.equal(secondView.nativeNode.class, 'second')
    assert.deepEqual(nativeView.attributes, {})
    for (const [name, nativeName] of [
        ['div', 'view'],
        ['span', 'view'],
        ['p', 'view'],
        ['section', 'view'],
        ['strong', 'text'],
        ['b', 'text'],
        ['br', 'text']
    ]) {
        const node = page.createElement(name)
        assert.equal(node.nodeName, name)
        assert.equal(node.nativeNode.name, nativeName)
        assert.equal(node.nativeNode.class.trim(), `h5-${name}`)
        node.delegateAttributeUpdate('class', 'card')
        assert.equal(node.nativeNode.class, `h5-${name} card`)
        node.delegateAttributeUpdate('class', `h5-${name} card`)
        assert.equal(node.nativeNode.class, `h5-${name} card`)
        node.delegateAttributeRemoval('class')
        assert.equal(node.nativeNode.class.trim(), `h5-${name}`)
        assert.deepEqual(
            node.nativeNode.childNodes.map((child: { textContent: string }) => child.textContent),
            name === 'br' ? ['\n'] : []
        )
    }
    for (const name of ['view', 'text', 'image', 'audit-card']) {
        const node = page.createElement(name)
        assert.equal(node.nativeNode.name, name)
        assert.equal(node.nativeNode.class, '')
    }
    assert.equal(page.createElement('DIV').nativeNode.name, 'view')
    const custom = page.createElement('audit-card')
    custom.__handlers.click = [() => {}]
    custom.delegateEventListener('click', true)
    assert.equal(custom.nativeNode.listeners.click.length, 1)
    assert.equal(custom.nativeNode.listeners.tap, undefined)
    custom.__handlers.click.length = 0
    custom.delegateEventListener('click', false)
    assert.equal(custom.nativeNode.listeners.click.length, 0)
    for (const [name, type] of [
        ['input', 'input'],
        ['textarea', 'input'],
        ['picker', 'change'],
        ['picker-view', 'change'],
        ['slider', 'change'],
        ['switch', 'change']
    ]) {
        const node = page.createElement(name)
        const native = node.nativeNode
        const listener = native.listeners[type][0]
        const event = { ...sdkEvent, type, detail: { value: 'changed' } }
        assert.equal(Object.hasOwn(native.dataset, 'sid'), false)
        assert.deepEqual(listener(event), { event, node })
        for (const subscribed of [true, false, true]) {
            node.delegateEventListener(type, subscribed)
            assert.deepEqual(native.listeners[type], [listener])
        }
        node.delegateEventListener('focus', true)
        assert.equal(native.listeners.focus.length, 1)
        node.delegateEventListener('focus', false)
        assert.deepEqual(native.listeners.focus, [])
        assert.deepEqual(native.listeners[type], [listener])
    }
    for (const name of [
        'checkbox',
        'radio',
        'checkbox-group',
        'radio-group',
        'form',
        'button',
        'label',
        'editor',
        'picker-view-column'
    ]) {
        const node = page.createElement(name)
        assert.deepEqual(node.nativeNode.listeners, {})
        for (const type of ['change', 'submit', 'reset']) {
            node.delegateEventListener(type, true)
            assert.equal(node.nativeNode.listeners[type].length, 1)
            node.delegateEventListener(type, false)
            assert.deepEqual(node.nativeNode.listeners[type], [])
        }
    }
    view.delegateEventListener('input', true)
    assert.equal(nativeView.listeners.input!.length, 1)
    view.delegateEventListener('input', false)
    assert.deepEqual(nativeView.listeners.input, [])
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
