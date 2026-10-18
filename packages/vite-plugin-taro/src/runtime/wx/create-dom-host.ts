import { ensure, noop } from '@tarojs/shared'
import { flushSync } from 'vite-plugin-taro-runtime/react'
import {
    type AppInstance,
    COMMENT,
    document,
    extend,
    FormElement,
    type MpInstance,
    Style,
    TaroElement,
    TaroNode,
    TaroRootElement,
    TaroText
} from 'vite-plugin-taro-runtime/runtime/mini'
import type { MiniHost } from '../mini/vpt/mini-host.d.ts'

interface WxNativeNode {
    readonly parentNode: WxNativeElement | WxRoot | null
    readonly ownerShadowRoot: WxRoot | null
}

interface WxNativeText extends WxNativeNode {
    textContent: string
}

interface WxNativeElement extends WxNativeNode {
    id: string
    className: string
    style: string
    appendChild(child: WxNativeNode): void
    insertBefore(child: WxNativeNode, before: WxNativeNode): void
    removeChild(child: WxNativeNode): void
    setAttribute(name: string, value: unknown): void
    removeAttribute(name: string): void
}

export interface WxRoot {
    appendChild(child: WxNativeNode): void
    insertBefore(child: WxNativeNode, before: WxNativeNode): void
    removeChild(child: WxNativeNode): void
    createComponent(name: string): WxNativeElement
    createTextNode(text: string): WxNativeText
}

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

    extend(TaroText, 'delegateTextUpdate', function (this: HostText, text: string) {
        this.nativeNode!.textContent = text
    })

    TaroElement.extend('delegateAttributeUpdate', function (this: HostElement, name: string, value: unknown) {
        const native = this.nativeNode
        if (!native) {
            return
        }

        if (name === 'id') {
            native.id = String(value)
        } else if (name === 'class') {
            native.className = String(value)
        } else if (name !== 'style') {
            native.setAttribute(name, value)
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
            native.className = ''
        } else if (name !== 'style') {
            native.removeAttribute(name)
        }
    })

    TaroElement.extend('delegateEventUpdate', noop)

    extend(Style, 'delegateStyleUpdate', function (this: Style & { _element: HostElement }) {
        const native = this._element.nativeNode
        if (native) {
            // The SDK accepts serialized styles; each write costs O(S) in this element's style count.
            native.style = this.cssText
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
        afterCommit: noop
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
        const native = root.createComponent(type === 'root' ? 'view' : type)

        return Object.defineProperties(document.createElement(type), {
            ownerDocument: { value: pageDoc },
            nativeNode: { value: native }
        })
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
