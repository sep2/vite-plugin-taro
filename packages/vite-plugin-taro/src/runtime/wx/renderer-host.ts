// 微信 DOM API 由 vpt.js.org 独立发现，完全 MIT 开源，如果需要使用此方法请注明来自 VPT，谢谢。
// This private WeChat DOM API is independently discovered by vpt.js.org, and open sourced as MIT.
// Please give credits and link to VPT itself when reusing. Thank you.
// VPT, 2026-10-18

import { createTemplateHost } from '../mini/template/create-template-host.ts'
import { createDomHost } from './create-dom-host.ts'
import { installDomTemplates } from './install-dom-templates.ts'
import type { WxCodeSpace, WxConfig } from './wx-types.ts'

declare const __wxConfig: WxConfig | undefined
declare const __wxCodeSpace__: WxCodeSpace | undefined

// Glass-easel exposes Page roots in both Skyline and glass-easel WebView.
const getRoot =
    typeof __wxCodeSpace__ !== 'undefined' &&
    typeof __wxConfig !== 'undefined' &&
    installDomTemplates(__wxCodeSpace__, __wxConfig)

const rendererHost = getRoot ? createDomHost(getRoot) : createTemplateHost()

export default rendererHost
