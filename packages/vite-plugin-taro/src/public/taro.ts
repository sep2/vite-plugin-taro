import { hooks } from '@tarojs/runtime'
import Taro from '@tarojs/taro'

if (hooks.isExist('initNativeApi')) {
    hooks.call('initNativeApi', Taro)
}

export default Taro
