import type { MpEvent } from 'vite-plugin-taro-runtime/runtime/mini'

type NativeListener = (event: MpEvent) => unknown

class NativeNode {
    // This test double records SDK mutations and native parent/child identity.
    parentNode: NativeNode | null = null
    readonly childNodes: NativeNode[] = []
    readonly attributes: Record<string, unknown> = {}
    // SDK-owned metadata and subscriptions let tests observe transport identity and callback lifetime.
    readonly dataset: Record<string, unknown> = {}
    readonly listeners: Record<string, NativeListener[]> = {}
    // The SDK template binding table retains exactly the wrapper to remove on each dynamic update.
    readonly bindings: Record<string, NativeListener | null> = {}
    id = ''
    className = ''
    style = ''
    textContent = ''

    readonly name: string
    readonly ownerShadowRoot: NativeNode | null

    constructor(name: string, ownerShadowRoot: NativeNode | null) {
        this.name = name
        this.ownerShadowRoot = ownerShadowRoot
    }

    appendChild(child: NativeNode): void {
        this.insertBefore(child, null)
    }

    insertBefore(child: NativeNode, before: NativeNode | null): void {
        child.parentNode?.removeChild(child)
        this.childNodes.splice(before ? this.childNodes.indexOf(before) : this.childNodes.length, 0, child)
        child.parentNode = this
    }

    removeChild(child: NativeNode): void {
        this.childNodes.splice(this.childNodes.indexOf(child), 1)
        child.parentNode = null
    }

    setAttribute(name: string, value: unknown): void {
        this.attributes[name] = value
    }

    removeAttribute(name: string): void {
        delete this.attributes[name]
    }

    setDataset(name: string, value: unknown): void {
        this.dataset[name] = value
    }

    addListener(name: string, listener: NativeListener): void {
        this.listeners[name] ??= []
        this.listeners[name].push(listener)
    }

    removeListener(name: string, listener: NativeListener): void {
        const listeners = this.listeners[name] ?? []
        const index = listeners.indexOf(listener)
        if (index >= 0) {
            listeners.splice(index, 1)
        }
    }

    tap(detail: Record<string, unknown>): void {
        // Deliver the mini-program event supplied by the SDK's template binding entry.
        const event = {
            type: 'tap',
            timeStamp: 123,
            detail,
            target: { id: this.id, dataset: this.dataset },
            currentTarget: { id: this.id, dataset: this.dataset },
            mark: {}
        }
        for (const listener of [...(this.listeners.tap ?? [])]) {
            listener(event)
        }
    }
}

export function createWxTestRoot() {
    const host = {
        templateInstance: {
            procGenWrapper: {
                v(
                    element: NativeNode,
                    name: string,
                    handler: NativeListener | null,
                    _final: boolean,
                    _mutated: boolean,
                    _capture: boolean,
                    _dynamic: boolean
                ): void {
                    const previous = element.bindings[name]
                    if (previous) {
                        element.removeListener(name, previous)
                    }
                    const listener = handler ? (event: MpEvent) => handler(event) : null
                    element.bindings[name] = listener
                    if (listener) {
                        element.addListener(name, listener)
                    }
                }
            }
        }
    }
    const root = Object.assign(new NativeNode('shadow-root', null), {
        getHostNode: () => host,
        createComponent(name: string): NativeNode {
            return new NativeNode(name, root)
        },
        createTextNode(text: string): NativeNode {
            return Object.assign(new NativeNode('#text', root), { textContent: text })
        }
    })
    return root
}
