type Instantiation = System.Registration | PromiseLike<System.Registration>
type ModuleLoader = () => Instantiation

/** Materialized from the preliminary output graph before Rolldown finalizes content hashes. */
declare const __VITE_PLUGIN_TARO_BOOTSTRAP_MODULE_URL__: string
declare const __VITE_PLUGIN_TARO_TRANSPORT_TABLE__: Record<string, ModuleLoader>

const bootstrapModuleUrl = __VITE_PLUGIN_TARO_BOOTSTRAP_MODULE_URL__
const transportTable = __VITE_PLUGIN_TARO_TRANSPORT_TABLE__

/** Adds the already-executed native bootstrap to the materialized capsule loader table. */
export function finalizeTransport(bootstrapModule: Readonly<Record<string, unknown>>) {
    const registration: System.Registration = [
        // Native bootstrap has completed its synchronous dependencies before SystemJS observes it.
        [],
        (exportBinding) => ({
            execute() {
                // Publish the actual CommonJS namespace so Rolldown's final export aliases remain intact.
                exportBinding(bootstrapModule)
            }
        })
    ]

    // The materialized URL identifies bootstrap without requiring its native chunk a second time.
    transportTable[bootstrapModuleUrl] = () => registration

    return transportTable
}
