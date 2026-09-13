/** biome-ignore-all assist/source/organizeImports: keep side effect order */

/** Taro runtime exports shared by the App, Page, and generated recursive component capsules. */
// @ts-expect-error: The active Mini contract resolves its Taro target initialization module.
import '\0vpt:taro-target-runtime'

// Native templates cannot render HTML names directly. These upstream hooks translate div -> view, img -> image,
// href -> url and click -> tap, including later attribute removal and event-listener changes, not just first render.
// Keep registration in the shared runtime dependency, rather than App/Page bodies that execute again during HMR.
import 'vite-plugin-taro-runtime/plugin-html/runtime'

export { createReactApp } from 'vite-plugin-taro-runtime/plugin-framework-react/runtime'
export { default as ReactDOM } from 'vite-plugin-taro-runtime/react'
export { createPageConfig, createRecursiveComponentConfig } from 'vite-plugin-taro-runtime/runtime/mini'

import { customWrapperCache } from 'vite-plugin-taro-runtime/runtime/mini'

// Replaced by the compiler; Mini runtimes do not provide Node's process global or its ambient types.
declare const process: { readonly env: { readonly NODE_ENV: string } }

// DevTools HMR runs in the bootstrap chunk, so publish the application graph's cache once on the language global.
if (process.env.NODE_ENV === 'development') {
    Reflect.set(globalThis, Symbol.for('customWrapperCache'), customWrapperCache)
}
