import { type AppInstance, COMMENT, document, FormElement } from 'vite-plugin-taro-runtime/runtime/mini'
import type { MiniHost } from '../mini/vpt/mini-host.d.ts'

type NativeMount = Parameters<NonNullable<AppInstance['mount']>>
type MountArgs = NativeMount | [component: NativeMount[0], id: string, complete: NativeMount[3]]
type TaroDocument = typeof document

/** Give each Page its own creation document within the shared Taro tree. */
export function createDomHost(): MiniHost {
    // Page IDs retain their creation documents until unmount completes; lookups are O(1) on average.
    const docs = new Map<string, TaroDocument>()

    return {
        bindApp(app) {
            const mount = app.mount
            app.mount = (...args: MountArgs) => {
                const type = pageType(args[1])
                if (!docs.has(type)) {
                    docs.set(type, createPageDocument())
                }

                return mount.apply(app, args)
            }

            const unmount = app.unmount
            app.unmount = (id: string, complete?: () => void) => {
                return unmount.call(app, id, () => {
                    docs.delete(pageType(id))
                    complete?.()
                })
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
            // The root receives its parent's context; descendants receive the Page document itself.
            const doc = docs.get(type)
            return doc ? doc.createElement('root') : (context.createElement?.(type) ?? document.createElement(type))
        },
        createText(_container, context: Partial<TaroDocument>, text) {
            return context.createTextNode?.(text) ?? document.createTextNode(text)
        },
        isFormElement(element) {
            return element instanceof FormElement
        },
        afterCommit() {}
    }
}

function pageType(id: string): string {
    return `vpt-page:${id}`
}

function createPageDocument(): TaroDocument {
    // Inherit the shared logical document and bind only its creation methods to this Page.
    const pageDoc: TaroDocument = Object.create(document)

    pageDoc.createElement = (name) => {
        return Object.defineProperty(document.createElement(name), 'ownerDocument', { value: pageDoc })
    }

    pageDoc.createTextNode = (text) => {
        return Object.defineProperty(document.createTextNode(text), 'ownerDocument', { value: pageDoc })
    }

    pageDoc.createComment = () => {
        const node = pageDoc.createTextNode('')
        node.nodeName = COMMENT
        return node
    }

    return pageDoc
}
