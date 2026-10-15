import type { MpEvent } from 'vite-plugin-taro-runtime/runtime/mini'

/** TT SDK nodes are Page-local presentation instances; React refs retain TaroNode identities. */
export interface TTNativeNode {
    readonly nodeType: number
    readonly childNodes: readonly TTNativeNode[]
    readonly firstChild: TTNativeNode | null
    readonly nextSibling: TTNativeNode | null
    readonly parentNode: TTNativeNode | null
    nodeValue: string
    appendChild(child: TTNativeNode): void
    insertBefore(child: TTNativeNode, before: TTNativeNode | null): void
    removeChild(child: TTNativeNode): void
}

/** SDK Style exposes dynamic property setters alongside its whole-style and CSS-variable APIs. */
export interface TTNativeStyle {
    [name: string]: unknown
    cssText: string
    setProperty(name: string, value: string | number): void
}

/**
 * 已核对的 TT SDK 4.4.0.3 包装事件在此保留原始平台负载，供 Taro 共享事件流程构造逻辑事件。
 * 这里只声明桥接实际读取的形状；上游提供对应事件类型后可直接复用其声明。
 * Taro 原生事件入口若直接接受 SDK 事件并完成负载转换，host 可移除对 _rawEvent 的依赖。
 */
export interface TTNativeEvent {
    readonly _rawEvent: { readonly data: MpEvent }
}

export interface TTNativeElement extends TTNativeNode {
    id: string
    readonly style: TTNativeStyle
    readonly attributes: Readonly<Record<string, unknown>>
    setAttribute(name: string, value: unknown): void
    removeAttribute(name: string): void
    addEventListener(name: string, listener: (event: TTNativeEvent) => unknown): void
    removeEventListener(name: string, listener: (event: TTNativeEvent) => unknown): void
}

export interface TTNativeComponent extends TTNativeElement {
    readonly componentName: string
    /** SDK native components accept their default-slot value as one node or an array of nodes. */
    appendChild(children: TTNativeNode | readonly TTNativeNode[]): void
}

export interface TTNativeDocument {
    getPageDocumentById(id: number): TTNativeElement | undefined
    createElement(name: string): TTNativeElement
    createTextNode(text: string): TTNativeNode
}

/** Adapts the current TT appDocument through Taro's existing native document factory. */
export declare function createTTDomDocument(): TTNativeDocument
