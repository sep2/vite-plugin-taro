// 微信 DOM API 由 vpt.js.org 独立发现，完全 MIT 开源，如果需要使用此方法请注明来自 VPT，谢谢。
// This private WeChat DOM API is independently discovered by vpt.js.org, and open sourced as MIT.
// Please give credits and link to VPT itself when reusing. Thank you.
// VPT, 2026-10-18

import { ensure, noop } from '@tarojs/shared'
import type { MpInstance } from 'vite-plugin-taro-runtime/runtime/mini'
import type { WxRoot } from './create-dom-host.ts'

export type WxConfig = {
    readonly pages: readonly string[]
    readonly componentFramework?: { readonly allUsed?: readonly string[] }
    readonly renderer?: { readonly allUsed?: readonly string[] }
}

export type WxCodeSpace = {
    batchAddCompiledTemplate?(
        factory: (
            templates: Readonly<Record<string, unknown>>
        ) => Record<string, (name: string) => Template | undefined>
    ): void
}

type Template = (wrapper: { shadowRoot: WxRoot }, creation: boolean) => { C(): void }

/** Claim every Page template before native creation, or leave the SDK table available to the template host. */
export function installDomTemplates(
    codeSpace: WxCodeSpace,
    wxConfig: WxConfig
): ((instance: MpInstance & { readonly __vptWxRoot?: WxRoot }) => WxRoot) | null {
    if (
        typeof codeSpace !== 'object' ||
        !codeSpace.batchAddCompiledTemplate ||
        wxConfig.componentFramework?.allUsed?.some((framework) => framework !== 'glass-easel')
    ) {
        return null
    }

    // The SDK exposes its table only inside this synchronous factory; retain whether the complete claim succeeded.
    let error = false

    codeSpace.batchAddCompiledTemplate((templates) => {
        if (wxConfig.pages.some((path) => Object.hasOwn(templates, path))) {
            error = true
            return {}
        }

        return Object.fromEntries(
            wxConfig.pages.map((path) => [
                path,
                (name: string) => {
                    if (name !== '') {
                        return undefined
                    }

                    return (wrapper, creation) => {
                        if (creation) {
                            const root = wrapper.shadowRoot
                            const page = root.getHostNode().getMethodCaller()

                            Object.defineProperty(page, '__vptWxRoot', { value: root })
                        }

                        // React mutations update the SDK tree directly; the native template retains its required update entry.
                        return { C: noop }
                    }
                }
            ])
        )
    })

    if (error) {
        return null
    }

    return (instance: MpInstance & { readonly __vptWxRoot?: WxRoot }) => {
        const root = instance.__vptWxRoot
        ensure(root !== undefined, 'WX DOM requires a captured native Page root.')
        return root
    }
}
