import type { RendererHost } from 'vite-plugin-taro-runtime/react'
import {
    document,
    extend,
    FormElement,
    type TaroElement,
    TaroNode,
    TaroRootElement,
    TaroText
} from 'vite-plugin-taro-runtime/runtime/mini'
import type { TTNativeDocument, TTNativeNode } from 'vite-plugin-taro-runtime/runtime/tt-document'

declare module 'vite-plugin-taro-runtime/runtime/mini' {
    interface TaroNode {
        // 节点创建或容器绑定时写入；逻辑节点在移动、解绑和重新插入时保留同一个原生句柄。
        nativeNode?: TTNativeNode
    }
}

/** 在独立的 TT runtime 中安装一次，复用 Taro 的节点创建和逻辑树操作。 */
export function createDomHost(
    nativeDocument: Pick<TTNativeDocument, 'createElement' | 'createTextNode'>
): RendererHost<TaroElement, object, TaroElement, TaroText> {
    // 包装 document 的工厂，使 React 创建和 Taro 自身的 textContent 等创建路径共用同一规则。
    const createElement = document.createElement
    document.createElement = function (type) {
        const node = createElement.call(this, type)
        // root 是由 Page 生命周期绑定原生容器的逻辑根，普通元素在创建时取得原生节点。
        if (!(node instanceof TaroRootElement)) {
            node.nativeNode = nativeDocument.createElement(node.nodeName)
        }
        return node
    }

    const createTextNode = document.createTextNode
    document.createTextNode = function (text) {
        const node = createTextNode.call(this, text)
        node.nativeNode = nativeDocument.createTextNode(text)
        return node
    }

    // 调用这些委托时，父子节点的原生句柄已经由创建路径或容器绑定提供。
    // 移动和替换仍由 Taro 分解成移除/插入；这里只转发当前操作，不重新遍历逻辑树。
    TaroNode.extend(
        'delegateChildInsertion',
        function (this: TaroNode, child: TaroNode, before: TaroNode | null | undefined) {
            if (before) {
                this.nativeNode!.insertBefore(child.nativeNode!, before.nativeNode!)
            } else {
                this.nativeNode!.appendChild(child.nativeNode!)
            }
        }
    )

    TaroNode.extend('delegateChildRemoval', function (this: TaroNode, child: TaroNode) {
        this.nativeNode!.removeChild(child.nativeNode!)
    })

    // textContent 的逐项删除/插入已同步原生树，模板的整表更新通知在此完成。
    TaroNode.extend('delegateChildReset', () => {})

    extend(TaroText, 'delegateTextUpdate', function (this: TaroText, text: string) {
        this.nativeNode!.nodeValue = text
    })

    return {
        createElement(_container, _context, type) {
            return document.createElement(type)
        },
        createText(_container, _context, text) {
            return document.createTextNode(text)
        },
        isFormElement(element) {
            return element instanceof FormElement
        },
        // 原生树操作已在各个 mutation 委托中同步完成。
        afterCommit() {}
    }
}
