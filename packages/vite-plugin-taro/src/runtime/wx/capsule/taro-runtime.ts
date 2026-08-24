/** biome-ignore-all assist/source/organizeImports: keep side effect orders */

/** Taro runtime exports shared by the App, Page, and generated recursive component capsules. */
import '@tarojs/plugin-platform-weapp/dist/runtime.js'

export { createReactApp } from '@tarojs/plugin-framework-react/dist/runtime'
export { default as ReactDOM } from '@tarojs/react'
export { createPageConfig, createRecursiveComponentConfig } from '@tarojs/runtime'
