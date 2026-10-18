class NativeNode {
    // This test double records SDK mutations and native parent/child identity.
    parentNode: NativeNode | null = null
    readonly childNodes: NativeNode[] = []
    readonly attributes: Record<string, unknown> = {}
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
}

export function createWxTestRoot() {
    const root = Object.assign(new NativeNode('shadow-root', null), {
        createComponent(name: string): NativeNode {
            return new NativeNode(name, root)
        },
        createTextNode(text: string): NativeNode {
            return Object.assign(new NativeNode('#text', root), { textContent: text })
        }
    })
    return root
}
