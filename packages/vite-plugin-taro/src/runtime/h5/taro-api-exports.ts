/**
 * Keep platform APIs and React hooks as static bindings. Importing the upstream default object or assigning hooks onto it
 * would make the application facade escape into a mutable object and retain otherwise unused APIs.
 */
export * from 'vite-plugin-taro-runtime/plugin-platform-h5/runtime/apis'
export * from '../client/taro/framework-apis.ts'
