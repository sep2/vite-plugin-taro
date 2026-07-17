// Install the stock minimal SystemJS loader before either native shell can request an application capsule.
import 'systemjs/s.js'

// Share the asynchronous configuration relay through the bootstrap module cached by native require.
export { createNativeConfig } from './native-config.ts'

// Vite requires this graph export while rendering; final AST rendering removes every preload call.
export const __vitePreload = <Value>(load: () => Value): Value => load()

// Keep transport outside the Rolldown graph; native rendering rewrites this placeholder to require.
declare function __VITE_PLUGIN_TARO_NATIVE_REQUIRE__(id: '../transport.js'): Pick<System.Loader, 'instantiate'>

// SystemJS installs on WeChat's `global` object; its properties are not lexical App-service bindings.
const installedSystem = (global as unknown as WeChatAppServiceGlobal & { System: System.Loader }).System
if (!installedSystem) {
    throw new Error('SystemJS failed to initialize in the WeChat runtime')
}

// Let stock SystemJS fetch inert capsules through the generated literal native transport.
installedSystem.instantiate = __VITE_PLUGIN_TARO_NATIVE_REQUIRE__('../transport.js').instantiate
