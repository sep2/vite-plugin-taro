// Transport itself executes only as native CommonJS. It lives beside bootstrap because together they implement the
// amphibious boundary that publishes native namespaces to SystemJS without re-evaluating their module bodies.
type RegistrationLoad = System.Registration | PromiseLike<System.Registration>
type RegistrationLoader = () => RegistrationLoad
type AmphibiousNamespaceLoader = () => Readonly<Record<string, unknown>>

type TransportSource = readonly ['capsule', RegistrationLoader] | readonly ['amphibious', AmphibiousNamespaceLoader]

/** Materialized from the preliminary output graph before Rolldown finalizes content hashes. */
declare const __VITE_PLUGIN_TARO_TRANSPORT_SOURCES__: Readonly<Record<string, TransportSource>>

/** Publishes one already-executed native CommonJS namespace without executing its module body a second time. */
function createAmphibiousRegistration(namespace: Readonly<Record<string, unknown>>): System.Registration {
    return [
        [],
        (exportBinding) => ({
            execute() {
                // Publish final Rolldown aliases rather than source export names. CommonJS owns module evaluation and
                // caching; this registration only presents the completed namespace to SystemJS dependency setters.
                exportBinding(namespace)
            }
        })
    ]
}

/**
 * Converts materialized physical sources into SystemJS registration loaders once during native transport evaluation.
 * Capsule loaders already return registrations. Amphibious loaders synchronously require a main-package CommonJS module
 * only when SystemJS first requests it, making bootstrap's deferred self-require safe through WeChat's CommonJS cache.
 */
export const transport: Readonly<Record<string, RegistrationLoader>> = createTransport(
    __VITE_PLUGIN_TARO_TRANSPORT_SOURCES__
)

function createTransport(sources: Readonly<Record<string, TransportSource>>): Record<string, RegistrationLoader> {
    const registrationLoaders: Record<string, RegistrationLoader> = {}

    for (const [moduleId, source] of Object.entries(sources)) {
        if (source[0] === 'capsule') {
            registrationLoaders[moduleId] = source[1]
            continue
        }

        const loadNamespace = source[1]
        registrationLoaders[moduleId] = () => createAmphibiousRegistration(loadNamespace())
    }

    return registrationLoaders
}
