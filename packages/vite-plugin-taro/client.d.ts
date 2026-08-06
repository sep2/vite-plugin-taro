import {
    defineNativeComponent,
    type NativeEventHandler,
    type NativeSchema
} from './src/runtime/client/taro/define-native-component.ts'

declare module 'virtual:taro/api' {
    import Taro = require('@tarojs/taro')
    export = Taro
    export default Taro
}

declare module 'virtual:taro/components' {
    export * from '@tarojs/components'
}

declare module 'virtual:taro/native' {
    export { defineNativeComponent, type NativeEventHandler, type NativeSchema }
}
