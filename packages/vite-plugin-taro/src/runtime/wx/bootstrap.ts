// Install the stock minimal SystemJS loader before either native shell can request an application capsule.
import 'systemjs/s.js'
import { createNativeConfig } from './native-config.ts'
import { transportTable } from './transport.ts'

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

const bootstrapModule = module.exports as Readonly<Record<string, unknown>>

// Capsules import Rolldown's final export aliases, so publish the actual CommonJS namespace instead of source names.
// The object is completed during this native module's execution before SystemJS can instantiate it.
const bootstrapRegistration: System.Registration = [
    [],
    (exportBinding) => ({
        execute() {
            exportBinding(bootstrapModule)
        }
    })
]

// Complete the private transport table before exposing instantiate to SystemJS.
transportTable[import.meta.url] = () => bootstrapRegistration

/** Loads native bootstrap or one application capsule from the finalized transport table. */
installedSystem.instantiate = (id: string): System.Registration => {
    const load = transportTable[id]
    if (!load) {
        throw new Error(`Unknown System module: ${id}`)
    }
    return load()
}
