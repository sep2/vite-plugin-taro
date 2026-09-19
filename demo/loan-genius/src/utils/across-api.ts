/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date: 2020-07-09 11:14:17
 * @Last Modified by: qiuz
 */

import Taro from 'virtual:taro/api'

export const isAndroid = () => {
    // TT's split device API is named getDeviceInfoSync; the shared system-info API provides the fields used here.
    const { platform, system } =
        import.meta.env.VITE_VPT_TARGET === 'tt' ? Taro.getSystemInfoSync() : Taro.getDeviceInfo()
    const normalizedPlatform = platform.toLowerCase()
    const normalizedSystem = system.toLowerCase()

    return normalizedPlatform === 'devtools' ? normalizedSystem.includes('android') : normalizedPlatform === 'android'
}

export const initBackHandler = (_callback?: () => boolean) => {
    // Web/H5 and WeChat Mini Program do not need a native hardware back handler.
}
