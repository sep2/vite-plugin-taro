import type { TTNativeDocument } from 'vite-plugin-taro-runtime/runtime/tt-document'
import { createTemplateHost } from '../mini/template/create-template-host.ts'
import { createDomHost } from './create-dom-host.ts'

declare const tt: {
    getRenderMode?(): number
    readonly appDocument?: TTNativeDocument
}

// renderer: 'dom' 是启动偏好：SDK 实际使用 V2 且提供 document 时选择 DOM，否则使用模板。
// 两个工厂仅在调用时安装节点委托；共享 renderer 加载前选定一次，后续 mutation 直接使用该实现。
// 上游 TT DOM 开关保持关闭以保留 Taro 逻辑树；此处读取 SDK 能力，而非上游 isEnableTTDom。
const nativeDocument = tt.getRenderMode?.() === 2 ? tt.appDocument : undefined

// DOM 直接使用原始 SDK document；逻辑文档、Page 根和 catchMove 由 Taro 与 VPT host 维护。
// 模板沿用既有调度与 setData。选择完成后的运行错误按原有路径抛出，不触发已挂载树的切换。
const rendererHost = nativeDocument ? createDomHost(nativeDocument) : createTemplateHost()

export default rendererHost
