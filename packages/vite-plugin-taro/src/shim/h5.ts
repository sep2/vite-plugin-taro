// Do not import @tarojs/plugin-platform-h5/dist/runtime here: its active CSS side effect
// appends component CSS at the end of <head>. The Stencil runtime patch keeps Taro CSS before app CSS instead.
// @ts-expect-error Taro exposes createReactApp from this runtime-only deep entry without types.
export { createReactApp } from '@tarojs/plugin-framework-react/dist/runtime'
export { createBrowserHistory, createHashHistory, createRouter, handleAppMount } from '@tarojs/router'
export { window } from '@tarojs/runtime'
