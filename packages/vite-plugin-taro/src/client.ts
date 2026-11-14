/* c8 ignore start -- Ambient declarations; validated by tsc and consumer type tests. */
declare module 'virtual:vpt' {
    /** Declares a page configuration factory evaluated for the build target. */
    export function defineVptPage(factory: import('./options.js').VptPageDeclaration): void
}

declare module 'virtual:taro/api' {
    import Taro = require('vite-plugin-taro-runtime/taro')
    export = Taro
}

declare module 'virtual:taro/components' {
    export * from 'vite-plugin-taro-runtime/components'
}

declare module 'virtual:taro/shared' {
    export * from '@tarojs/shared'
}

declare module 'virtual:taro/native' {
    type NativeModule = typeof import('vite-plugin-taro/types/native')

    export type NativeComponentEvent<Detail> = import('vite-plugin-taro/types/native').NativeComponentEvent<Detail>

    export const defineNativeComponent: NativeModule['defineNativeComponent']
}
/* c8 ignore stop */
