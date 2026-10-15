import { ensure } from '@tarojs/shared'
import type { TTNativeDocument } from 'vite-plugin-taro-runtime/runtime/tt-document'
import { createDomHost } from './create-dom-host.ts'

declare const tt: { readonly appDocument?: TTNativeDocument }

// 编译器仅在 TT renderer: 'dom' 时加载此入口；SDK 必须提供原生 document。
ensure(tt.appDocument !== undefined, 'TT DOM renderer requires tt.appDocument')

// Taro 保留逻辑 document；host 直接使用 SDK 的元素、文本和 Page document 接口。
// 不调用上游 createTTDomDocument：其文档树、root 替换和 catchMove 包装由我们的逻辑树与 host 负责。
// SDK 工厂保持原样；当前接入范围是使用 createElement 的内置组件。
const domHost = createDomHost(tt.appDocument!)

export default domHost
