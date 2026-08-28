declare module 'virtual:taro/api' {
    import Taro = require('@tarojs/taro')
    export = Taro
    export default Taro
}

declare module 'virtual:taro/components' {
    export * from '@tarojs/components'
}

declare module 'virtual:taro/native' {
    type NativeModule = typeof import('./dist/runtime/client/taro/define-native-component.js')

    export type NativeComponentEvent<Detail> =
        import('./dist/runtime/client/taro/define-native-component.js').NativeComponentEvent<Detail>

    export const defineNativeComponent: NativeModule['defineNativeComponent']
}
