// Install the stock minimal SystemJS loader before any native shell can request an application capsule.
import 'systemjs/s.js'
import { createNativeConfig } from './native-config.ts'
import { finalizeTransport } from './transport.ts'

// Share the asynchronous configuration relay through the bootstrap module cached by native require.
export { createNativeConfig }

// Vite wraps dynamic imports with this browser preload hook. WX has no modulepreload transport, so native chunks call
// the loader directly; application capsules receive this same cached export through bootstrap's native registration.
export const __vitePreload = <Value>(load: () => Value): Value => load()

// SystemJS installs on WeChat's `global` object; its properties are not lexical App-service bindings.
const installedSystem = (global as unknown as WeChatAppServiceGlobal & { System: System.Loader }).System
if (!installedSystem) {
    throw new Error('SystemJS failed to initialize in the WeChat runtime')
}

// Capsules import Rolldown's final export aliases, so register the actual CommonJS namespace rather than source names.
const transportTable = finalizeTransport(module.exports as Readonly<Record<string, unknown>>)

/** Loads native bootstrap or one application capsule from the finalized transport table. */
installedSystem.instantiate = (moduleId: string): System.Registration | PromiseLike<System.Registration> => {
    const load = transportTable[moduleId]
    if (!load) {
        throw new Error(`Unknown System module: ${moduleId}`)
    }
    return load()
}
