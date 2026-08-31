/** biome-ignore-all assist/source/organizeImports: keep side effect orders */

/** Taro runtime exports shared by the App, Page, and generated recursive component capsules. */
import '@tarojs/plugin-platform-weapp/dist/runtime.js'

export { createReactApp } from '@tarojs/plugin-framework-react/dist/runtime'
export { default as ReactDOM } from '@tarojs/react'
export { createPageConfig, createRecursiveComponentConfig } from '@tarojs/runtime'

import { customWrapperCache } from '@tarojs/runtime'

// DevTools HMR runs in the bootstrap chunk, so publish the application graph's cache once on their shared App global.
if (process.env.NODE_ENV === 'development') {
    Reflect.set(global, Symbol.for('customWrapperCache'), customWrapperCache)
}
