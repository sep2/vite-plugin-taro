declare module 'virtual:taro' {
    import Taro = require('@tarojs/taro')

    const taro: typeof Taro
    export default taro
}

declare module 'virtual:taro/components' {
    export * from '@tarojs/components'
}
