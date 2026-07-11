import '@tarojs/components/global.css'
import '@tarojs/components/dist/taro-components/taro-components.css'

// Import the CSS files directly instead of @tarojs/plugin-platform-h5/dist/runtime:
// that runtime adds only taro-components.css plus optional polyfills, while this shim needs global.css too.
// @ts-expect-error Taro exposes createReactApp from this runtime-only deep entry without types.
export { createReactApp } from '@tarojs/plugin-framework-react/dist/runtime'
export { createBrowserHistory, createHashHistory, createRouter, handleAppMount } from '@tarojs/router'
export { window } from '@tarojs/runtime'
