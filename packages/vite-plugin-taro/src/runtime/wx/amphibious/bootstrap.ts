// Install the minimal SystemJS loader and its synchronous-import extension before any native entry requests a capsule.
import '../systemjs/system-core.js'
import { transport } from './transport.ts'

declare const __VITE_PLUGIN_TARO_APP_CONFIG__: Record<string, unknown>

/** Shares one App configuration object between the specialized bootstrap and App capsule. */
export const appConfig = __VITE_PLUGIN_TARO_APP_CONFIG__

// WX has no modulepreload transport. Genuine application import() boundaries retain System.import() and may load
// asynchronous subpackage or top-level-await graphs through this identity wrapper.
export const __vitePreload = <Value>(load: () => Value): Value => load()

// SystemJS installs on WeChat's `global` object; its properties are not lexical bindings.
const installedSystem = (global as unknown as WeChatGlobal & { System: System.Loader }).System
if (!installedSystem) {
    throw new Error('SystemJS failed to initialize in the WeChat runtime')
}

// Transport returns synchronous registrations for main-package capsules and amphibious modules, and promise-like
// registrations only for capsules that physically live in generated subpackages.
installedSystem.instantiate = transport
