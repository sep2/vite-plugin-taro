import { toCamelCase } from '@tarojs/shared'
import type { RendererHost } from 'vite-plugin-taro-runtime/react'
import {
    document,
    extend,
    FormElement,
    Style,
    TaroElement,
    TaroNode,
    TaroRootElement,
    TaroText
} from 'vite-plugin-taro-runtime/runtime/mini'
import type { TTNativeDocument, TTNativeElement, TTNativeNode } from 'vite-plugin-taro-runtime/runtime/tt-document'

declare module 'vite-plugin-taro-runtime/runtime/mini' {
    interface TaroNode {
        // 节点创建或容器绑定时写入；逻辑节点在移动、解绑和重新插入时保留同一个原生句柄。
        nativeNode?: TTNativeNode
    }

    interface TaroElement {
        nativeNode?: TTNativeElement
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

    // Taro 已维护 props、dataset、ID 和移除拦截；这里只转发当前属性，保留原值。
    // style 的设置/移除已触发 Style 委托，其原生写入统一由该委托完成。
    TaroElement.extend('delegateAttributeUpdate', function (this: TaroElement, name: string, value: unknown) {
        if (name !== 'style') {
            this.nativeNode!.setAttribute(nativeAttributeName(name), value)
        }
    })
    TaroElement.extend('delegateAttributeRemoval', function (this: TaroElement, name: string) {
        if (name !== 'style') {
            this.nativeNode!.removeAttribute(nativeAttributeName(name))
        }
    })

    // 单项变更直接转发；普通属性使用 SDK setter，连字符前缀交由 setProperty 安装对应访问器。
    // cssText 的整体替换由 Taro 的 _pending 批量处理完成后通知一次，此时才读取完整样式。
    // 此处单项转发相对样式项数为 O(1)，Taro mutation 记录与 SDK 内部序列化仍有各自的成本。
    extend(Style, 'delegateStyleUpdate', function (this: Style, name?: string, value?: string | number | null) {
        const style = this._element.nativeNode!.style
        if (name === undefined) {
            style.cssText = this.cssText
        } else if (name[0] === '-') {
            style.setProperty(name, value ?? '')
        } else {
            style[name] = value ?? ''
        }
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

// 复用 Taro TT 的属性命名规则：普通属性为 camelCase，data-* / aria-* 保留原名。
// 成本随当前名称长度变化，不遍历节点的属性集合。
function nativeAttributeName(name: string): string {
    return name.startsWith('data-') || name.startsWith('aria-') ? name : toCamelCase(name)
}
