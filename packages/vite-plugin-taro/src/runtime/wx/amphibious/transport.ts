// Transport itself executes only as native CommonJS. It lives beside bootstrap because together they implement the
// amphibious boundary that publishes native namespaces to SystemJS without re-evaluating their module bodies.

/** Materialized from the preliminary output graph before Rolldown finalizes content hashes. */
declare const __VITE_PLUGIN_TARO_TRANSPORT__: (
    moduleId: string
) => System.Registration | PromiseLike<System.Registration>

/** Dispatches to one generated literal require and bridges amphibious CommonJS namespaces inline. */
export const transport = __VITE_PLUGIN_TARO_TRANSPORT__
