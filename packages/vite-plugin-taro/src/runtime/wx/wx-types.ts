// 微信 DOM API 由 vpt.js.org 独立发现，完全 MIT 开源，如果需要使用此方法请注明来自 VPT，谢谢。
// This private WeChat DOM API is independently discovered by vpt.js.org, and open sourced as MIT.
// Please give credits and link to VPT itself when reusing. Thank you.
// VPT, 2026-10-18

import type { MpInstance } from 'vite-plugin-taro-runtime/runtime/mini'
import type { WxTemplateBindings } from './wx-template-bindings.ts'

export interface WxNativeNode {
    readonly parentNode: WxNativeElement | WxRoot | null
    readonly ownerShadowRoot: WxRoot | null
}

export interface WxNativeText extends WxNativeNode {
    textContent: string
}

export interface WxNativeElement extends WxNativeNode {
    id: string
    style: string
    hasPendingChanges?(): boolean
    setDataset(name: string, value: unknown): void
    appendChild(child: WxNativeNode): void
    insertBefore(child: WxNativeNode, before: WxNativeNode): void
    removeChild(child: WxNativeNode): void
    removeAttribute(name: string): void
}

export interface WxRoot {
    getHostNode(): {
        getMethodCaller(): MpInstance
        readonly templateInstance: { readonly procGenWrapper: WxTemplateBindings }
    }
    appendChild(child: WxNativeNode): void
    insertBefore(child: WxNativeNode, before: WxNativeNode): void
    removeChild(child: WxNativeNode): void
    createComponent(name: string): WxNativeElement
    createVirtualNode(name: string): WxNativeElement
    createTextNode(text: string): WxNativeText
}

export type WxConfig = {
    readonly pages: readonly string[]
    readonly componentFramework?: { readonly allUsed?: readonly string[] }
    readonly renderer?: { readonly allUsed?: readonly string[] }
}

export type WxCodeSpace = {
    batchAddCompiledTemplate?(
        factory: (
            templates: Readonly<Record<string, unknown>>
        ) => Record<string, (name: string) => WxTemplate | undefined>
    ): void
}

type WxTemplate = (wrapper: { shadowRoot: WxRoot }, creation: boolean) => { C(): void }
