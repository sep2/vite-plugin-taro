type NativeModule = Readonly<Record<string, unknown>>

/**
 * Exposes cached native CommonJS exports as an inert System registration.
 *
 * Bootstrap cannot be a capsule because App, Page, and Component shells require it synchronously. Vite's preload helper
 * is also imported by application capsules, so SystemJS needs a namespace for the same native module. The native shell
 * executes bootstrap before its first System.import; require therefore reads the completed native module cache, while
 * this bridge only adapts its exports to System.register's [dependencies, declaration] protocol.
 */
function registerNativeModule(namespace: NativeModule): System.Registration {
    return [
        // Native bootstrap has already resolved its own dependencies before SystemJS observes it.
        [],
        (exportBinding) => ({
            // Publishing the object exposes every enumerable CommonJS binding in the SystemJS namespace.
            execute() {
                exportBinding(namespace)
            }
        })
    ]
}

/** Replaced with the finalized literal native module switch. */
declare function __VITE_PLUGIN_TARO_INSTANTIATE__(
    id: string,
    registerNative: (namespace: NativeModule) => System.Registration
): System.Registration

/**
 * Implements SystemJS's instantiate hook.
 * Specialization returns either an existing capsule registration or a synthetic registration for native bootstrap.
 */
function instantiate(id: string): System.Registration {
    return __VITE_PLUGIN_TARO_INSTANTIATE__(id, registerNativeModule)
}

// Native bootstrap installs this function as System.instantiate after loading SystemJS.
module.exports = { instantiate }
