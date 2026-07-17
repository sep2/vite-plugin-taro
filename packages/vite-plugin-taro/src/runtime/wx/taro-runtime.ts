/** Runtime exports shared by the asynchronous App and Page modules. */
import '@tarojs/plugin-platform-weapp/dist/runtime.js'

// @ts-expect-error: Taro exposes createReactApp from this runtime-only deep entry without types.
export { createReactApp } from '@tarojs/plugin-framework-react/dist/runtime'
export { default as ReactDOM } from '@tarojs/react'
export { createPageConfig } from '@tarojs/runtime'
