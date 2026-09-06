import taro from 'vite-plugin-taro-runtime/taro'
import * as frameworkApis from './framework-apis.ts'

/**
 * Mini keeps Taro's shared mutable API object and bulk native initialization. This assignment preserves the upstream API
 * loader's behavior after both dependencies have evaluated, regardless of when the framework's native hook was registered.
 */
Object.assign(taro, frameworkApis)

// @ts-expect-error Taro uses export= types; Rolldown exposes the CommonJS runtime properties as named exports.
export * from 'vite-plugin-taro-runtime/taro'
export * from './framework-apis.ts'
export default taro
