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

export interface TTNativeElement extends TTNativeNode {
    id: string
    readonly attributes: Readonly<Record<string, unknown>>
    setAttribute(name: string, value: unknown): void
    removeAttribute(name: string): void
    addEventListener(name: string, listener: (event: MpEvent) => unknown): void
    removeEventListener(name: string, listener: (event: MpEvent) => unknown): void
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
