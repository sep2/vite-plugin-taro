/** biome-ignore-all assist/source/organizeImports: keep side effect order */

/** Taro runtime exports shared by the App, Page, and generated recursive component capsules. */
// @ts-expect-error: The active Mini contract resolves its Taro platform initialization module.
import '\0vpt:taro-platform-runtime'

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
