/** biome-ignore-all assist/source/organizeImports: keep runtime side effect order */

/** Runtime exports consumed by the generated H5 entry. */
import 'vite-plugin-taro-runtime/components/global.css'
import 'vite-plugin-taro-runtime/components/dist/taro-components/taro-components.css'

export { createReactApp } from 'vite-plugin-taro-runtime/plugin-framework-react/runtime'
export { createHashHistory, createRouter, handleAppMount } from 'vite-plugin-taro-runtime/router'
export { window } from 'vite-plugin-taro-runtime/runtime/h5'
