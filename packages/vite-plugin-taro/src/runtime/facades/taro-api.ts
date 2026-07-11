// Ensure Taro's React runtime registers its `initNativeApi` hook before @tarojs/taro is initialized.
import '@tarojs/plugin-framework-react/dist/runtime'
import { hooks } from '@tarojs/runtime'
import Taro from '@tarojs/taro'

if (hooks.isExist('initNativeApi')) {
    hooks.call('initNativeApi', Taro)
}

// @ts-expect-error @tarojs/taro declares export= types, but vite-plugin-taro target aliases expose runtime named exports.
export * from '@tarojs/taro'
export default Taro
