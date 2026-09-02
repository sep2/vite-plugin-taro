/** biome-ignore-all assist/source/organizeImports: keep side effect order */

/** Taro runtime exports shared by the App, Page, and generated recursive component capsules. */
// @ts-expect-error: The active Mini contract resolves its Taro platform initialization module.
import '\0vpt:taro-platform-runtime'

export { createReactApp } from '@tarojs/plugin-framework-react/dist/runtime'
export { default as ReactDOM } from '@tarojs/react'
export { createPageConfig, createRecursiveComponentConfig } from '@tarojs/runtime'

import { customWrapperCache } from '@tarojs/runtime'

// DevTools HMR runs in the bootstrap chunk, so publish the application graph's cache once on their shared App global.
if (process.env.NODE_ENV === 'development') {
    Reflect.set(__VPT_RUNTIME_GLOBAL__, Symbol.for('customWrapperCache'), customWrapperCache)
}
