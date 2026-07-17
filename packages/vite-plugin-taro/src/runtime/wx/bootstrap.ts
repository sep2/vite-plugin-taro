// Install the stock minimal SystemJS loader before either native shell can request an application capsule.
import 'systemjs/s.js'

// Share the asynchronous configuration relay through the bootstrap module cached by native require.
export { createNativeConfig } from './native-config.ts'

// Replace Vite's browser preload behavior with direct loading for the non-browser WeChat runtime.
export const __vitePreload = <Value>(load: () => Value): Value => load()

// Keep transport outside the Rolldown graph; native rendering rewrites this placeholder to require.
declare function __VITE_PLUGIN_TARO_NATIVE_REQUIRE__(id: '../transport.js'): Pick<System.Loader, 'instantiate'>

// Let stock SystemJS fetch inert capsules through the generated literal native transport.
System.instantiate = __VITE_PLUGIN_TARO_NATIVE_REQUIRE__('../transport.js').instantiate
