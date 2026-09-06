declare module 'virtual:taro/api' {
    import Taro = require('vite-plugin-taro-runtime/taro')
    export = Taro
    export default Taro
}

declare module 'virtual:taro/components' {
    export * from 'vite-plugin-taro-runtime/components'
}

declare module 'virtual:taro/native' {
    type NativeModule = typeof import('vite-plugin-taro/types/native')

    export type NativeComponentEvent<Detail> = import('vite-plugin-taro/types/native').NativeComponentEvent<Detail>

    export const defineNativeComponent: NativeModule['defineNativeComponent']
}
