// 微信 DOM API 由 vpt.js.org 独立发现，完全 MIT 开源，如果需要使用此方法请注明来自 VPT，谢谢。
// This private WeChat DOM API is independently discovered by vpt.js.org, and open sourced as MIT.
// Please give credits and link to VPT itself when reusing. Thank you.
// VPT, 2026-10-18

import { ensure, noop, toCamelCase, toDashed } from '@tarojs/shared'
import { blockElements, ensureHtmlClass, inlineElements } from 'vite-plugin-taro-runtime/plugin-html/html-elements'
import { flushSync } from 'vite-plugin-taro-runtime/react'
import {
    type AppInstance,
    COMMENT,
    document,
    eventHandler,
    extend,
    FormElement,
    type MpInstance,
    Style,
    TaroElement,
    TaroNode,
    TaroRootElement,
    TaroText
} from 'vite-plugin-taro-runtime/runtime/mini'
import { getFormChangeEvent } from '../mini/vpt/get-form-change-event.ts'
import type { MiniHost } from '../mini/vpt/mini-host.d.ts'
import type { WxNativeElement, WxNativeNode, WxNativeText, WxRoot } from './wx-types.ts'

type TaroDocument = typeof document
type AppMountParams = Parameters<NonNullable<AppInstance['mount']>>
type MountArgs = AppMountParams | [component: AppMountParams[0], id: string, complete: AppMountParams[3]]

const pageOutlet = 'vpt_page_outlet'

// Host-local types describe the creation-time handles retained on ordinary Taro instances.
interface HostNode extends TaroNode {
    readonly nativeNode?: WxNativeNode
}

interface HostElement extends TaroElement {
    readonly nativeNode?: WxNativeElement
}

interface HostText extends TaroText {
    readonly nativeNode?: WxNativeText
}

/** Install the WX host once per runtime, with creation bound to each Page's exact SDK root. */
export function createDomHost(getRoot: (instance: MpInstance) => WxRoot): MiniHost {
    // Page IDs retain their creation documents until unmount completes; lookups are O(1) on average.
    const docs = new Map<string, TaroDocument>()

    // Synchronous scopes track clean (false) and dirty (true) styles; absence forwards immediately.
    const styleUpdates = new WeakMap<Style, boolean>()

    // Document/App structure is logical; Page elements carry SDK handles. Delegates are shared by all Pages.
    TaroNode.extend('delegateChildInsertion', function (this: HostElement, child: HostNode, before?: HostNode | null) {
        const native = this.nativeNode
        if (native) {
            if (before) {
                native.insertBefore(child.nativeNode!, before.nativeNode!)
            } else {
                native.appendChild(child.nativeNode!)
            }
        }
    })

    TaroNode.extend('delegateChildRemoval', function (this: HostElement, child: HostNode) {
        this.nativeNode?.removeChild(child.nativeNode!)
    })

    TaroNode.extend('delegateChildReset', noop)

    // Native nodes disable template scope lookup and its cache invalidation.
    TaroNode.extend('_scope', { value: undefined })
    TaroNode.extend('delegateContextInvalidation', noop)

    extend(TaroText, 'delegateTextUpdate', function (this: HostText, text: string) {
        this.nativeNode!.textContent = text
    })

    // Native attributes retain logical mutation semantics and use a constant presentation state.
    TaroElement.extend('prepareAttributeMutation', () => false)

    TaroElement.extend('delegateAttributeUpdate', function (this: HostElement, name: string, value: unknown) {
        const native = this.nativeNode
        if (!native) {
            return
        }

        if (name === 'id') {
            native.id = String(value)
        } else if (name === 'class') {
            setNativeClass(this, String(value))
        } else if (name.startsWith('data-')) {
            setNativeDataset(native, toCamelCase(name.slice(5)), value)
        } else if (name !== 'style') {
            setNativeProperty(native, toDashed(name), value)
        }
    })

    TaroElement.extend('delegateAttributeRemoval', function (this: HostElement, name: string) {
        const native = this.nativeNode
        if (!native) {
            return
        }

        if (name === 'id') {
            native.id = ''
        } else if (name === 'class') {
            setNativeClass(this, '')
        } else if (name.startsWith('data-')) {
            const key = toCamelCase(name.slice(5))
            // Taro removes the attribute prop; its event-facing dataset needs the same removal.
            delete this.dataset[key]
            setNativeDataset(native, key, undefined)
        } else if (name !== 'style') {
            removeNativeProperty(native, toDashed(name))
        }
    })

    TaroElement.extend('delegateEventUpdate', noop)

    TaroElement.extend('delegateEventListener', function (this: HostElement, type: string, subscribed: boolean) {
        // Taro's HTML hooks alias click to the tap handler array; custom component events keep their own name.
        const click = type === 'click' && this.getEventHandlers('click')
        const name = click && click === this.getEventHandlers('tap') ? 'tap' : type

        // Value synchronization retains its SDK subscription across business handler changes.
        if (this.nativeNode && name !== getFormChangeEvent(this.nodeName)) {
            bindNativeEvent(this, name, subscribed)
        }
    })

    extend(Style, 'delegateStyleUpdate', function (this: Style & { _element: HostElement }) {
        const native = this._element.nativeNode
        if (native) {
            const dirty = styleUpdates.get(this)
            if (dirty === undefined) {
                // Serialize the final logical style once; standalone imperative changes forward immediately.
                native.style = this.cssText
            } else if (!dirty) {
                styleUpdates.set(this, true)
            }
        }
    })

    extend(TaroRootElement, 'enqueueUpdate', noop)

    extend(
        TaroRootElement,
        'performUpdate',
        function (
            this: TaroRootElement & HostElement,
            initial: Parameters<TaroRootElement['performUpdate']>[0],
            complete: Parameters<TaroRootElement['performUpdate']>[1]
        ) {
            if (initial) {
                const native = this.nativeNode!
                const root = native.ownerShadowRoot!
                if (native.parentNode !== root) {
                    root.appendChild(native)
                }
            }

            this.flushUpdateCallback()
            complete?.({})
        }
    )

    return {
        bindApp(app, container) {
            container.delegateChildInsertion = noop
            container.delegateChildRemoval = noop

            const mount = app.mount
            app.mount = (...args: MountArgs) => {
                ensure(args.length === 4, 'WX DOM rendering requires native Page context; use prerender: false.')

                const [, id, getCtx] = args
                const type = pageType(id)

                if (!docs.has(type)) {
                    docs.set(type, createPageDocument(getRoot(getCtx())))
                }

                return mount.apply(app, args)
            }

            const unmount = app.unmount
            app.unmount = (id: string, complete?: () => void) => {
                // Native onUnload must finish React ref/layout cleanup before the SDK destroys this Page.
                return flushSync(() =>
                    unmount.call(app, id, () => {
                        docs.delete(pageType(id))
                        complete?.()
                    })
                )
            }
        },
        getPageRootType(id) {
            const type = pageType(id)
            return docs.has(type) ? type : 'root'
        },
        getChildHostContext(parent, type) {
            return docs.get(type) ?? parent
        },
        createElement(_container, context: Partial<TaroDocument>, type) {
            // The Page root receives its parent's context; descendants receive the Page document itself.
            const doc = docs.get(type)
            if (doc) {
                return doc.createElement('root')
            }

            if (context.createElement) {
                return context.createElement(type)
            }

            ensure(type === pageOutlet, 'WX native elements require a Page document.')

            const outlet = document.createElement(type)

            outlet.delegateChildInsertion = noop
            outlet.delegateChildRemoval = removePageRoot

            return outlet
        },
        createText(_container, context: Partial<TaroDocument>, text) {
            ensure(context.createTextNode !== undefined, 'WX native text requires a Page document.')
            return context.createTextNode(text)
        },
        isFormElement(element) {
            return element instanceof FormElement
        },
        batchStyleUpdate(element: HostElement, update) {
            const style = element.style
            if (styleUpdates.has(style)) {
                return update()
            }
            styleUpdates.set(style, false)
            try {
                update()
            } finally {
                const dirty = styleUpdates.get(style)
                styleUpdates.delete(style)
                if (dirty) {
                    // Dirty styles have an immutable native handle; the cleared scope allows SDK re-entry.
                    element.nativeNode!.style = style.cssText
                }
            }
        },
        afterCommit: noop
    }
}

function getTemplateBindings(native: WxNativeNode) {
    ensure(!!native.ownerShadowRoot, 'native node ownerShadowRoot should not be empty')

    return native.ownerShadowRoot!.getHostNode().templateInstance.procGenWrapper
}

function bindNativeEvent(node: HostElement, type: string, subscribed: boolean): void {
    const native = node.nativeNode!
    // SDK dynamic bindings own event conversion and matching native listener replacement/removal.
    getTemplateBindings(native).v(
        native,
        type,
        subscribed ? (event) => eventHandler(event, node) : null,
        false,
        false,
        false,
        true
    )
}

function getHtmlTagName(name: string): 'view' | 'text' | undefined {
    // Mini view retains its native class contract; HTML aliases retain their logical tag names.
    if (name !== 'view' && blockElements.has(name)) {
        return 'view'
    }
    if (inlineElements.has(name)) {
        return 'text'
    }
    return undefined
}

function setNativeClass(node: HostElement, value: string): void {
    const native = node.nativeNode!
    // Semantic HTML classes belong to native presentation, alongside the user's logical class list.
    const className = getHtmlTagName(node.nodeName) ? ensureHtmlClass(node.nodeName, value) : value
    getTemplateBindings(native).c(native, className)
}

function setNativeDataset(native: WxNativeElement, key: string, value: unknown): void {
    // Native sid identifies the logical event target; user data-sid lives in Taro's public dataset.
    if (key !== 'sid') {
        native.setDataset(key, value)
    }
}

function setNativeProperty(native: WxNativeElement, name: string, value: unknown): void {
    // The SDK owns property routing and completion, including component queues and model-binding feedback.
    const bindings = getTemplateBindings(native)
    bindings.r(native, name, value)
    bindings.endBindingMapUpdateForElement(native)
}

function removeNativeProperty(native: WxNativeElement, name: string): void {
    // Only SDK components expose a property queue; native nodes remove attributes directly.
    if (native.hasPendingChanges) {
        setNativeProperty(native, name, undefined)
    } else {
        native.removeAttribute(name)
    }
}

function removePageRoot(child: HostNode, options: Parameters<TaroNode['delegateChildRemoval']>[1]): void {
    if (options.cleanRef !== false) {
        const native = child.nativeNode!
        native.parentNode?.removeChild(native)
    }
}

function pageType(id: string): string {
    return `vpt-page:${id}`
}

function createPageDocument(root: WxRoot): TaroDocument {
    // Inherit the shared tree and indexes; only creation is bound to this SDK root.
    const pageDoc: TaroDocument = Object.create(document)

    pageDoc.createElement = (name) => {
        const type = name.toLowerCase()
        const htmlTag = getHtmlTagName(type)
        const native = root.createComponent(htmlTag ?? (type === 'root' ? 'view' : type))

        const node: HostElement = Object.defineProperties(document.createElement(type), {
            ownerDocument: { value: pageDoc },
            nativeNode: { value: native }
        })

        // Event targets resolve through Taro's stable index, including elements without a user ID.
        native.setDataset('sid', node.sid)
        if (htmlTag) {
            setNativeClass(node, '')
        }
        if (type === 'br') {
            // Taro's HTML template renders a newline without adding a logical child to the void element.
            native.appendChild(root.createTextNode('\n'))
        }

        // Taro templates bind value events even when no business handler is installed.
        const formEvent = getFormChangeEvent(type)
        if (formEvent) {
            bindNativeEvent(node, formEvent, true)
        }

        return node
    }

    pageDoc.createTextNode = (text) => {
        const native = root.createTextNode(text)

        return Object.defineProperties(document.createTextNode(text), {
            ownerDocument: { value: pageDoc },
            nativeNode: { value: native }
        })
    }

    pageDoc.createComment = () => {
        const node = pageDoc.createTextNode('')
        node.nodeName = COMMENT
        return node
    }

    return pageDoc
}
