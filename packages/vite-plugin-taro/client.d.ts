declare module 'virtual:taro/api' {
    import Taro = require('@tarojs/taro')
    export = Taro
    export default Taro
}

declare module 'virtual:taro/components' {
    export * from '@tarojs/components'
}

declare module 'virtual:taro/native' {
    type NativeModule = typeof import('vite-plugin-taro/types/native')

    export type NativeComponentEvent<Detail> = import('vite-plugin-taro/types/native').NativeComponentEvent<Detail>

    export const defineNativeComponent: NativeModule['defineNativeComponent']
}
