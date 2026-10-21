import assert from 'node:assert/strict'
import test from 'node:test'
import { toCamelCase, toDashed } from '@tarojs/shared'
import { createWxTestRoot } from './create-wx-test-root.ts'
import { bundleRuntimeEntry, createExecutionContext, executeRuntimeEntry } from './runtime-entry-test-utils.ts'

test('WX host manages Page-owned content under SDK-owned roots', async (t) => {
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
    const load = t.mock.fn()
    const mount = t.mock.fn(function (this: { root: ReturnType<typeof createWxTestRoot> }) {
        const identity = createPageIdentity.mock.calls.at(-1)?.result
        assert.ok(identity)
        const page = host.getChildHostContext({}, host.getPageRootType(identity.path))
        assert.strictEqual(page.createTextNode('probe').nativeNode.ownerShadowRoot, this.root)
    })
    const query = { id: 'native', full: 'a%3Db', empty: '' }
    const identity = { path: 'A', params: query }
    const createPageIdentity = t.mock.fn((_route: string, _query: unknown) => identity)
    const createPageConfig = t.mock.fn((...args: unknown[]) => ({ onLoad: load, args }))
    const sync = t.mock.fn((callback: () => unknown) => callback())
    const dispatch = t.mock.fn((event: unknown, node: unknown) => ({ event, node }))
    const bundle = await bundleRuntimeEntry({
        entry: 'wx/create-dom-host.ts',
        mocks: {
            '@tarojs/shared': `export const noop = () => {}; export const { toCamelCase, toDashed } = globalThis.harness; export function ensure(value, message) { if (!value) throw new Error(message) }`,
            'vite-plugin-taro-runtime/react': 'export const flushSync = globalThis.harness.sync',
            '../mini/vpt/create-page-identity.ts':
                'export const createPageIdentity = globalThis.harness.createPageIdentity',
            '../mini/vpt/mount-page.ts': 'export const mountPage = globalThis.harness.mount',
            '../mini/vpt/get-page-query.ts': 'export const getPageQuery = () => globalThis.harness.query',
            'vite-plugin-taro-runtime/runtime/mini': `
                export const Current = {}
                export const { createPageConfig, document, extend, FormElement, Style, TaroElement, TaroEvent, TaroNode, TaroRootElement, TaroText } = globalThis.harness
                export const COMMENT = 'comment'
                export const eventHandler = globalThis.harness.dispatch
            `
        },
        defines: {}
    })
    const { createDomHost } = executeRuntimeEntry(
        bundle,
        createExecutionContext({
            createPageConfig,
            createPageIdentity,
            mount,
            query,
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
    const getRoot = t.mock.fn((instance: { root: typeof sdk }) => instance.root)
    const host = createDomHost(getRoot)
    const onUnmount = t.mock.fn()
    const app = {
        mount(component: unknown, id: string, ...callbacks: unknown[]) {
            assert.equal(callbacks.length, 1)
            assert.strictEqual(this, app)
            assert.notEqual(host.getPageRootType(id), 'root')
            return [component, id, ...callbacks]
        },
        unmount(_id: string, complete?: () => void) {
            onUnmount()
            complete?.()
        }
    }
    host.bindApp(app, document.createElement('root'))
    const component = () => null
    for (const prerender of [undefined, false, true]) {
        const nativeConfig = { navigationBarTitleText: 'Native' }
        const config = host.createPage(component, { path: 'pages/native', config: nativeConfig, prerender })
        const call = createPageConfig.mock.calls.at(-1)
        assert.ok(call?.result)
        assert.strictEqual(config.methods, call.result)
        assert.strictEqual(config.methods.onLoad, load, 'WX registers Taro native load directly')
        assert.deepEqual(call.arguments, [component, 'pages/native', undefined, nativeConfig])
        assert.equal(config.data, undefined)
        const native = { root: sdk }
        assert.equal(getRoot.mock.callCount(), mount.mock.callCount(), 'registration does not create documents')
        const loadsBeforeAttach = load.mock.callCount()
        config.lifetimes.attached.call(native)
        assert.deepEqual(createPageIdentity.mock.calls.at(-1)?.arguments, ['pages/native', query])
        assert.strictEqual(mount.mock.calls.at(-1)?.this, native)
        assert.deepEqual(mount.mock.calls.at(-1)?.arguments, [
            component,
            { path: 'pages/native', config: nativeConfig, prerender },
            identity
        ])
        assert.equal(load.mock.callCount(), loadsBeforeAttach, 'attachment only mounts')
        config.methods.onLoad.call(native, query)
        assert.strictEqual(load.mock.calls.at(-1)?.this, native)
        assert.deepEqual(load.mock.calls.at(-1)?.arguments, [query])
    }
    assert.equal(getRoot.mock.callCount(), 3, 'each attachment prepares its Page document before mounting')
    const complete = t.mock.fn()
    const type = host.getPageRootType('A')
    assert.equal(sync.mock.callCount(), 0)
    assert.deepEqual(app.mount(component, 'A', complete), [component, 'A', complete])
    assert.equal(sync.mock.callCount(), 1, 'the first Page mount is synchronous')
    const parent = {}
    assert.equal(host.getPageRootType('A'), type, 'Page root types depend only on identity')
    const page = host.getChildHostContext(parent, type)
    assert.deepEqual(app.mount(component, 'A', complete), [component, 'A', complete])
    assert.equal(sync.mock.callCount(), 2, 'repeated Page mounts are synchronous')
    assert.strictEqual(host.getChildHostContext(parent, type), page, 'repeated mounts retain the Page document')
    assert.equal(getRoot.mock.callCount(), 3, 'App mounting retains the attachment-owned document')
    assert.strictEqual(getRoot.mock.calls.at(-1)?.arguments[0], mount.mock.calls.at(-1)?.this)
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
    createPageIdentity.mock.mockImplementationOnce(() => ({ path: 'B', params: query }))
    host.createPage(component, { path: 'pages/second', prerender: false }).lifetimes.attached.call({ root: secondSdk })
    app.mount(component, 'B', complete)
    assert.equal(sync.mock.callCount(), 3, 'each Page mount is synchronous')
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
    root.performUpdate(true)
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
    const removeNativeRoot = t.mock.method(sdk, 'removeChild')
    assert.strictEqual(outlet.delegateChildRemoval, outlet.delegateChildInsertion, 'the outlet is entirely logical')
    assert.strictEqual(nativeRoot.parentNode, sdk, 'the Page shadow root owns the native root')
    outlet.delegateChildInsertion(root)
    outlet.delegateChildRemoval(root, { cleanRef: false })
    outlet.delegateChildRemoval(root, {})
    outlet.delegateChildReset()
    assert.strictEqual(sdk.childNodes[0], nativeRoot)
    assert.equal(removeNativeRoot.mock.callCount(), 0)
    root.delegateChildRemoval(view)
    assert.equal(nativeRoot.childNodes.length, 0, 'ordinary Page content removal updates the SDK tree')
    root.delegateChildInsertion(view, null)
    assert.strictEqual(nativeRoot.childNodes[0], nativeView)
    host.afterCommit(null)
    const flushesBeforeUnload = sync.mock.callCount()
    onUnmount.mock.mockImplementation(() => outlet.delegateChildRemoval(root, {}))
    const released = t.mock.fn()
    app.unmount('A', released)
    assert.equal(released.mock.callCount(), 1)
    assert.strictEqual(sdk.childNodes[0], nativeRoot, 'the SDK owns Page teardown')
    assert.equal(host.getPageRootType('A'), type)
    assert.strictEqual(host.getChildHostContext(parent, type), parent, 'unmount releases the Page document')
    app.unmount('A')
    assert.equal(sync.mock.callCount(), flushesBeforeUnload + 2)
    host.createPage(component, { path: 'pages/native', prerender: false }).lifetimes.attached.call({ root: sdk })
    app.mount(component, 'A', complete)
    assert.equal(sync.mock.callCount(), flushesBeforeUnload + 3, 'a newly mounted Page starts a fresh scope')
    assert.equal(getRoot.mock.callCount(), 5)
    assert.notStrictEqual(host.getChildHostContext(parent, type), page)

    onUnmount.mock.mockImplementation(() => {
        throw new Error('unmount failure')
    })
    assert.throws(() => app.unmount('A'), /unmount failure/)
    assert.notStrictEqual(host.getChildHostContext(parent, type), parent, 'failed cleanup retains the Page document')
    onUnmount.mock.mockImplementation(() => outlet.delegateChildRemoval(root, {}))
    app.unmount('A', released)
    assert.equal(host.getPageRootType('A'), type)
    assert.strictEqual(host.getChildHostContext(parent, type), parent)
    assert.equal(released.mock.callCount(), 2)
    assert.equal(removeNativeRoot.mock.callCount(), 0)
})
