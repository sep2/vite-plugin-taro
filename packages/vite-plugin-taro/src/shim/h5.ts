import '@tarojs/plugin-platform-h5/dist/runtime'

// @ts-expect-error Taro exposes createReactApp from this runtime-only deep entry without types.
export { createReactApp } from '@tarojs/plugin-framework-react/dist/runtime'
export { createBrowserHistory, createHashHistory, createRouter, handleAppMount } from '@tarojs/router'
export { window } from '@tarojs/runtime'
