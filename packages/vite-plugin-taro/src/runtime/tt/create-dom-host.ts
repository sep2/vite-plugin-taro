import { DEFAULT_COMPONENTS, ensure, noop, TT_SPECIFIC_COMPONENTS, toCamelCase } from '@tarojs/shared'
import {
    document,
    eventHandler,
    extend,
    FormElement,
    Style,
    TaroElement,
    TaroNode,
    TaroRootElement,
    TaroText
} from 'vite-plugin-taro-runtime/runtime/mini'
import type {
    TTNativeDocument,
    TTNativeElement,
    TTNativeEvent,
    TTNativeNode
} from 'vite-plugin-taro-runtime/runtime/tt-document'
import { getFormChangeEvent } from '../mini/vpt/get-form-change-event.ts'
import type { MiniHost } from '../mini/vpt/mini-host.d.ts'

// Host-local types describe the creation-time handles retained on ordinary Taro instances.
interface HostNode extends TaroNode {
    // 创建原生呈现时写入；逻辑节点在移动、挂载、解绑和重新插入时保留同一个原生句柄。
    nativeNode?: TTNativeNode
}

interface HostElement extends TaroElement {
    nativeNode?: TTNativeElement
    // 首次订阅时创建，随后所有事件及解绑共用此固定引用；业务处理器仍由 __handlers 管理。
    // 回调持有逻辑接收节点，使派发不依赖节点 ID；解绑也必须使用注册时的同一个函数。
    // 上游 Taro 原生事件桥接接管这些职责后，可连同本字段一起移交。
    nativeEventListener?: (event: TTNativeEvent) => unknown
}

declare const tt: {
    getBuiltInComponents?(): string[] | Set<string> | undefined
}

const pageOutlet = 'vpt_page_outlet'

function getTtBuiltinComponents() {
    // 与上游 createTTDomDocument 一致：平台名单优先，缺省使用 Taro 的通用与 TT 专属组件。
    // Set 直接复用；数组和缺省名单只在初始化时构建一次 Set（O(B)），每次创建平均 O(1) 查询。
    const components = tt.getBuiltInComponents?.()

    return components instanceof Set
        ? components
        : new Set(components ?? [...DEFAULT_COMPONENTS, ...TT_SPECIFIC_COMPONENTS])
}

/** 在独立的 TT runtime 中安装一次，复用 Taro 的节点创建和逻辑树操作。 */
export function createDomHost(nativeDocument: TTNativeDocument): MiniHost {
    const builtInComponents = getTtBuiltinComponents()

    // 包装 document 的工厂，使 React 创建和 Taro 自身的 textContent 等创建路径共用同一规则。
    const createElement = document.createElement
    document.createElement = function (type) {
        const node: HostElement = createElement.call(this, type)

        if (node.nodeName === pageOutlet) {
            // outlet 只拥有逻辑 Page 关系；原生根在各自的 Page document 中挂载。
            node.delegateChildInsertion = noop
            node.delegateChildRemoval = removePageRoot
            return node
        }

        // 与 H5 的页面 div 相同，root 自己拥有一个可离线构建的原生根元素。
        // 它会参与布局；平台 Page document 是后续挂载目标，二者的身份始终分开。
        // 其他名称按 SDK 的组件注册解析；组件内部及 slot 的呈现由 SDK 管理。
        const name = node.nodeName

        node.nativeNode =
            node instanceof TaroRootElement
                ? nativeDocument.createElement('view')
                : builtInComponents.has(name)
                  ? nativeDocument.createElement(name)
                  : nativeDocument.createNativeComponent(name, { __tt__inner__options__: { name } })

        // TT SDK 4.4.0.3 通用元素没有实时 value/checked getter，getAttribute 读取 JS 属性存储。
        // 常驻值事件进入共享 Taro 表单流程，支持无业务处理器时的值同步及 text input 受控恢复。
        const formEvent = getFormChangeEvent(node.nodeName)
        if (formEvent) {
            updateNativeListener(node, `bind${formEvent}`, true)
        }
        return node
    }

    const createTextNode = document.createTextNode
    document.createTextNode = function (text) {
        const node: TaroText & HostNode = createTextNode.call(this, text)
        node.nativeNode = nativeDocument.createTextNode(text)

        return node
    }

    // 调用这些委托时，父子节点的原生句柄已经由创建路径提供。
    // 同父节点移动直接插入已有原生节点；替换的旧节点仍由移除委托处理。
    TaroNode.extend(
        'delegateChildInsertion',
        function (this: HostNode, child: HostNode, before: HostNode | null | undefined) {
            if (before) {
                this.nativeNode!.insertBefore(child.nativeNode!, before.nativeNode!)
            } else {
                this.nativeNode!.appendChild(child.nativeNode!)
            }
        }
    )

    TaroNode.extend('delegateChildRemoval', function (this: HostNode, child: HostNode) {
        this.nativeNode!.removeChild(child.nativeNode!)
    })

    // textContent 的逐项删除/插入已同步原生树，模板的整表更新通知在此完成。
    TaroNode.extend('delegateChildReset', noop)

    extend(TaroText, 'delegateTextUpdate', function (this: HostNode, text: string) {
        this.nativeNode!.nodeValue = text
    })

    // Taro 已维护 props、dataset、ID 和移除拦截；这里只转发当前属性，保留原值。
    // style 的设置/移除已触发 Style 委托，其原生写入统一由该委托完成。
    TaroElement.extend('delegateAttributeUpdate', function (this: HostElement, name: string, value: unknown) {
        if (name !== 'style') {
            this.nativeNode!.setAttribute(nativeAttributeName(name), value)
            if (name === 'catchMove') {
                updateTouchMove(this)
            }
        }
    })
    TaroElement.extend('delegateAttributeRemoval', function (this: HostElement, name: string) {
        if (name !== 'style') {
            this.nativeNode!.removeAttribute(nativeAttributeName(name))
            if (name === 'catchMove') {
                updateTouchMove(this)
            }
        }
    })

    // DOM 节点无需随监听器变化切换模板类型；处理器、once 与移除匹配仍由 Taro 维护。
    // 上游将这类副作用限定在模板 host 后，可去掉此空实现。
    TaroElement.extend('delegateEventUpdate', noop)

    TaroElement.extend('delegateEventListener', function (this: HostElement, type: string, subscribed: boolean) {
        // 值同步属于节点本身；最后一个业务处理器移除时，创建阶段的常驻订阅仍需保留。
        if (type === getFormChangeEvent(this.nodeName)) {
            return
        }
        // catchMove 已由 updateTouchMove 保留 catch 入口，业务监听共用它，避免再注册 bind 入口。
        if (type === 'touchmove' && this.props.catchMove) {
            return
        }
        if (this.nodeName === 'map' && (type === 'begin' || type === 'end')) {
            // TaroEventTarget 将 regionchange 展开为 begin/end，TT 的原生入口则是 bindregionchange。
            // 上游直接 TT DOM 不经过这个逻辑拆分；保留 Taro 节点时需要在此合并订阅。
            // 读取另一现有数组的长度，即可判断是否仍被共用，无需新增计数或扫描事件表。
            // 上游 Taro 原生事件委托接管 begin/end 的订阅合并后，可移除此分支。
            if (this.__handlers[type === 'begin' ? 'end' : 'begin']?.length) {
                return
            }
            updateNativeListener(this, 'bindregionchange', subscribed)
        } else {
            // 与上游 @tarojs/react 的 TT setEvent 一致：普通事件使用 bind 前缀。
            updateNativeListener(this, `bind${type}`, subscribed)
        }
    })

    // 单项变更直接转发；普通属性使用 SDK setter，连字符前缀交由 setProperty 安装对应访问器。
    // cssText 的整体替换由 Taro 的 _pending 批量处理完成后通知一次，此时才读取完整样式。
    // 此处单项转发相对样式项数为 O(1)，Taro mutation 记录与 SDK 内部序列化仍有各自的成本。
    extend(
        Style,
        'delegateStyleUpdate',
        function (this: Style & { _element: HostElement }, name?: string, value?: string | number | null) {
            const style = this._element.nativeNode!.style
            if (name === undefined) {
                style.cssText = this.cssText
            } else if (name[0] === '-') {
                style.setProperty(name, value ?? '')
            } else {
                style[name] = value ?? ''
            }
        }
    )

    // DOM mutation 已直接提交给 SDK；根保留生命周期入口，完成回调由 performUpdate 处理。
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
                // 原有 onLoad 完成回调已赋 ctx；这里只查该 Page，整棵离线原生根只插入一次。
                // 读取现有 parentNode 避免重复初始通知重插节点，不增加 mounted 状态或根子节点遍历。
                const page = nativeDocument.getPageDocumentById(this.ctx!.__webviewId__!)
                ensure(page !== undefined, `TT Page document not found: ${this.ctx!.__webviewId__}`)
                if (this.nativeNode!.parentNode !== page) {
                    page!.appendChild(this.nativeNode!)
                }
            }
            // 复用现有完成回调；这里只确认 JS 根接入，不代表原生布局或屏幕绘制完成。
            this.flushUpdateCallback()
            complete?.({})
        }
    )

    return {
        bindApp(_app, container) {
            // App 根由 createVptApp 在首次提交前明确交付；其子关系只由 Taro 维护。
            // Page 原生根分别挂到平台 Page document，普通节点的原生 mutation 委托保持直接转发。
            container.delegateChildInsertion = noop
            container.delegateChildRemoval = noop
        },
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
        afterCommit: noop
    }
}

function removePageRoot(child: HostNode, options: Parameters<TaroNode['delegateChildRemoval']>[1]): void {
    // Taro 移动节点时以 cleanRef:false 暂时移除；outlet 的逻辑顺序不改变各 Page 的原生挂载位置。
    if (options.cleanRef !== false) {
        // 最终解绑整个原生根，保留其后代和句柄；原生根已被平台移除时无需重复操作。
        const native = child.nativeNode!
        native.parentNode?.removeChild(native)
    }
}

// 复用 Taro TT 的属性命名规则：普通属性为 camelCase，data-* / aria-* 保留原名。
// 成本随当前名称长度变化，不遍历节点的属性集合。
function nativeAttributeName(name: string): string {
    return name.startsWith('data-') || name.startsWith('aria-') ? name : toCamelCase(name)
}

function updateNativeListener(node: HostElement, name: string, subscribed: boolean): void {
    if (subscribed) {
        // SDK 包装事件有自己的方法和传播标志；4.4.0.3 的 _rawEvent.data 保留原始平台负载，
        // 交给 eventHandler 可复用 Taro 的事件构造、React 优先级/批处理及表单流程。
        // 回调直接持有逻辑接收节点，不依赖可变 ID，也不建立新的反向映射。
        // 上游 Taro 若能直接接收 SDK 事件并关联逻辑接收节点，可移交这层负载转换；
        // 原生注册/解绑所需的稳定回调身份仍须由对应事件桥接保证。
        node.nativeEventListener ??= (event) => eventHandler(event._rawEvent.data, node)
        node.nativeNode!.addEventListener(name, node.nativeEventListener)
    } else if (node.nativeEventListener) {
        node.nativeNode!.removeEventListener(name, node.nativeEventListener)
    }
}

function updateTouchMove(node: HostElement): void {
    // 上游 createTTDomDocument 通过添加/移除 catchtouchmove 实现 catchMove，而非只写入该属性。
    // 此处还让业务 touchmove 处理器共用唯一入口，切换 bind/catch 时保持单次逻辑派发。
    // 所需订阅由逻辑属性和现有处理器数组决定，SDK 自身处理重复注册；这里只调整两个已知绑定。
    // 上游 Taro 原生 host 接管等价切换后，可连同属性委托中的调用一起移交。
    // 另一替代条件是 TT SDK 让 catchMove 属性本身控制冒泡，同时保持一个普通监听入口即可派发一次。
    updateNativeListener(node, 'bindtouchmove', !node.props.catchMove && !!node.__handlers.touchmove?.length)
    updateNativeListener(node, 'catchtouchmove', !!node.props.catchMove)
}
