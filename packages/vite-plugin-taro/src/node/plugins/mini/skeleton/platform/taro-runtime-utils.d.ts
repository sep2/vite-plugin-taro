/** Bridges Taro's runtime-utils values to the declarations it publishes under the separate dist/types tree. */
declare module '@tarojs/plugin-platform-weapp/dist/runtime-utils.js' {
    export const components: typeof import('@tarojs/plugin-platform-weapp/dist/types/components').components
}

declare module '@tarojs/plugin-platform-alipay/dist/runtime-utils.js' {
    export const components: typeof import('@tarojs/plugin-platform-alipay/dist/types/components').components
}
