// Do not import @tarojs/plugin-platform-h5/dist/runtime here: its only active side effect in this build
// is unlayered component CSS. Apps opt into the layered copy through virtual:taro/css instead.
// @ts-expect-error Taro exposes createReactApp from this runtime-only deep entry without types.
export { createReactApp } from '@tarojs/plugin-framework-react/dist/runtime'
export { createBrowserHistory, createHashHistory, createRouter, handleAppMount } from '@tarojs/router'
export { window } from '@tarojs/runtime'

const insertedRuntimeCss = new Set<string>()
let taroCssElement: HTMLStyleElement | undefined

const globalScope = globalThis as typeof globalThis & {
    __vitePluginTaroInsertRuntimeCss?: (scopeId: string, cssText: string) => boolean
}
// Exposes a tiny global hook consumed by the patched Stencil runtime before it appends component CSS to the DOM.
globalScope.__vitePluginTaroInsertRuntimeCss ??= insertTaroRuntimeCss

/**
 * Inserts late-loaded Taro component CSS into the `taro` layer once per Stencil scope to avoid duplicate unlayered styles.
 */
function insertTaroRuntimeCss(scopeId: string, cssText: string): boolean {
    if (insertedRuntimeCss.has(scopeId)) return true
    insertedRuntimeCss.add(scopeId)
    getTaroCssElement().append(document.createTextNode(`\n@layer taro {\n${cssText}\n}\n`))
    return true
}

/**
 * Reuses one runtime style element so dynamically loaded component CSS preserves insertion order within the same layer.
 */
function getTaroCssElement(): HTMLStyleElement {
    if (taroCssElement?.isConnected) return taroCssElement

    taroCssElement = document.createElement('style')
    document.head.append(taroCssElement)
    return taroCssElement
}
