/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date: 2020-07-09 11:14:17
 * @Last Modified by: qiuz
 */

import Taro from 'virtual:taro/api'

export const isAndroid = () => {
    const { platform, system } = Taro.getDeviceInfo()
    const normalizedPlatform = platform.toLowerCase()
    const normalizedSystem = system.toLowerCase()

    return normalizedPlatform === 'devtools' ? normalizedSystem.includes('android') : normalizedPlatform === 'android'
}

export const initBackHandler = (_callback?: () => boolean) => {
    // Web/H5 and WeChat Mini Program do not need a native hardware back handler.
}
