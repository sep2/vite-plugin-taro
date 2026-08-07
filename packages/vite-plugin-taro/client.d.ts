declare module 'virtual:taro/api' {
    import Taro = require('@tarojs/taro')
    export = Taro
    export default Taro
}

declare module 'virtual:taro/components' {
    export * from '@tarojs/components'
}

declare module 'virtual:taro/native' {
    type NativeModule = typeof import('./src/runtime/client/taro/define-native-component.ts')

    export type NativeComponentEvent<Detail> =
        import('./src/runtime/client/taro/define-native-component.ts').NativeComponentEvent<Detail>

    export const defineNativeComponent: NativeModule['defineNativeComponent']
}
