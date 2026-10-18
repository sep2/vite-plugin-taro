import { toCamelCase } from '@tarojs/shared'
import type { MpEvent } from 'vite-plugin-taro-runtime/runtime/mini'

type NativeListener = (event: MpEvent) => unknown
type PropertyInitializers = Readonly<Record<string, () => unknown>>

class PropertyGroup {
    // Record committed SDK inputs, including undefined; SDK type coercion is outside this double.
    readonly data: Record<string, unknown>
    // Template bindings queue property writes until the host commits them.
    readonly pending: [string, unknown][] = []

    constructor(initializers: PropertyInitializers) {
        this.data = Object.fromEntries(Object.entries(initializers).map(([name, initialize]) => [name, initialize()]))
    }

    replaceProperty(name: string, value: unknown): boolean {
        if (!Object.hasOwn(this.data, name)) {
            return false
        }
        this.pending.push([name, value])
        return true
    }

    applyDataUpdates(_skipModelListener: boolean): void {
        for (const [name, value] of this.pending.splice(0)) {
            this.data[name] = value
        }
    }
}

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
    class = ''
    style = ''
    textContent = ''

    readonly name: string
    readonly ownerShadowRoot: NativeNode | null
    readonly _$dataGroup?: PropertyGroup
    readonly hasPendingChanges?: () => boolean

    constructor(name: string, ownerShadowRoot: NativeNode | null, initializers?: PropertyInitializers) {
        this.name = name
        this.ownerShadowRoot = ownerShadowRoot
        if (initializers) {
            const group = new PropertyGroup(initializers)
            this._$dataGroup = group
            this.hasPendingChanges = () => group.pending.length > 0
        }
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
        const target = { id: this.id, dataset: this.dataset }
        // Follow native ancestry; the SDK supplies a separate mini-program payload for each receiver.
        for (let current: NativeNode | null = this; current; current = current.parentNode) {
            const event = {
                type: 'tap',
                timeStamp: 123,
                detail,
                target,
                currentTarget: { id: current.id, dataset: current.dataset },
                mark: {}
            }
            for (const listener of [...(current.listeners.tap ?? [])]) {
                listener(event)
            }
        }
    }
}

export function createWxTestRoot(properties?: Readonly<Record<string, PropertyInitializers>>) {
    const host = {
        templateInstance: {
            procGenWrapper: {
                c(element: NativeNode, value: string): void {
                    element.class = value
                },
                r(element: NativeNode, name: string, value: unknown): void {
                    if (element._$dataGroup) {
                        element._$dataGroup.replaceProperty(toCamelCase(name), value)
                    } else {
                        element.setAttribute(name, value)
                    }
                },
                endBindingMapUpdateForElement(element: NativeNode): void {
                    if (element.hasPendingChanges?.()) {
                        element._$dataGroup!.applyDataUpdates(true)
                    }
                },
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
            return new NativeNode(name, root, properties?.[name])
        },
        createTextNode(text: string): NativeNode {
            return Object.assign(new NativeNode('#text', root), { textContent: text })
        }
    })
    return root
}
