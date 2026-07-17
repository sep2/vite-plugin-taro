type ModuleLoader = () => System.Registration

/** Materialized from the finalized output graph before this native entry is emitted. */
declare const __VITE_PLUGIN_TARO_BOOTSTRAP_MODULE_URL__: string
declare const __VITE_PLUGIN_TARO_TRANSPORT_TABLE__: Record<string, ModuleLoader>

const bootstrapModuleUrl = __VITE_PLUGIN_TARO_BOOTSTRAP_MODULE_URL__
const transportTable = __VITE_PLUGIN_TARO_TRANSPORT_TABLE__

type NativeModule = Readonly<Record<string, unknown>>

/** Adds the already-executed native bootstrap to the materialized capsule loader table. */
export function createTransportTable(nativeModule: NativeModule) {
    const registration: System.Registration = [
        // Native bootstrap has completed its synchronous dependencies before SystemJS observes it.
        [],
        (exportBinding) => ({
            execute() {
                // Publish the actual CommonJS namespace so Rolldown's final export aliases remain intact.
                exportBinding(nativeModule)
            }
        })
    ]

    // The materialized URL identifies bootstrap without requiring its native chunk a second time.
    transportTable[bootstrapModuleUrl] = () => registration

    return transportTable
}
