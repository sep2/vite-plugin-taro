/** biome-ignore-all assist/source/organizeImports: keep runtime side effect order */

/** Runtime exports consumed by the generated H5 entry. */
import '@tarojs/components/global.css'
import '@tarojs/components/dist/taro-components/taro-components.css'

export { createReactApp } from 'vite-plugin-taro-runtime/plugin-framework-react/runtime'
export { createHashHistory, createRouter, handleAppMount } from '@tarojs/router'
export { window } from 'vite-plugin-taro-runtime/runtime/h5'
