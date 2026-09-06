/*
 * This physical module is the shared facade, not the generic Taro implementation. Its own `vite-plugin-taro-runtime/taro` request is
 * resolved by the client plugin to the selected platform APIs, while application requests resolve back to this facade.
 * React's API loader then extends this same object with framework lifecycle hooks.
 */
import taro from 'vite-plugin-taro-runtime/taro'

// Re-export platform APIs while preserving object identity for the framework loader's lifecycle assignments.
// @ts-expect-error @tarojs/taro uses export= types while Rolldown exposes its runtime properties as named exports.
export * from 'vite-plugin-taro-runtime/taro'
export default taro
