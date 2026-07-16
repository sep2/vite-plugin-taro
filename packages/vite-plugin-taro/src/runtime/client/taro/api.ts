import '@tarojs/plugin-framework-react/dist/runtime'
import { hooks } from '@tarojs/runtime'
import Taro from '@tarojs/taro'

if (hooks.isExist('initNativeApi')) {
    hooks.call('initNativeApi', Taro)
}

// @ts-expect-error @tarojs/taro declares export= types, but the facade also exposes its runtime named exports.
export * from '@tarojs/taro'
export default Taro
