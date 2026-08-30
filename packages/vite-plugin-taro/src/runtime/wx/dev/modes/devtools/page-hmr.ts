type NativePage = {
    data: Record<string, unknown>
}

// A symbol cannot collide with WeChat or Taro's string-named Page options, and it lets a later injection recover the exact
// config-local state without a route map or runtime-global WeakMap.
const pageHmrStateKey: unique symbol = Symbol('vpt.pageHmrState')

type PageHmrState = {
    /** True only across the unload/load/show sequence triggered by one native re-registration. */
    isReregistering: boolean
    /** The Page bound to `this` by ordinary onLoad, retained until ordinary onUnload. */
    mountedPage: NativePage | undefined
}

type HmrPageConfig = {
    data: Record<string, unknown>
    onUnload?: unknown
    onLoad?: unknown
    onShow?: unknown
    [pageHmrStateKey]?: PageHmrState
}

/** Calls a native lifecycle with the same Page bound to `this` and the same arguments. */
function forward(handler: unknown, page: unknown, args: unknown[]): void {
    if (typeof handler === 'function') handler.apply(page, args)
}

/** Tracks the mounted native Page and prepares its static config for DevTools re-registration. */
export function injectPageHmr(config: HmrPageConfig): HmrPageConfig {
    const existingState = config[pageHmrStateKey]

    if (existingState) {
        const mountedPage = existingState.mountedPage
        /*
         * The static config can outlive a native Page instance. Before its first ordinary onLoad, or after a real onUnload,
         * there is no mounted Page or current view-model to carry into another registration. Leave the lifecycle gate unarmed
         * and preserve the config's existing initial data so a future real onLoad still enters Taro normally.
         */
        if (!mountedPage) {
            return config
        }

        /*
         * Arm the lifecycle wrappers on this exact static config before it is passed back to `Page(config)`. DevTools then
         * triggers an unload/load/show sequence for that native re-registration: unload and load observe `true` and return before
         * entering Taro, preserving the mounted React tree and its original Page connection; show consumes the one-shot gate by
         * restoring `false`. Ordinary navigation never enters this branch, and every Page config owns an independent state, so
         * no route map, global phase, or Page identity comparison participates in the decision.
         */
        existingState.isReregistering = true
        /*
         * `Page(config)` reads `config.data` as the initial native view-model for this registration. Supplying the mounted Page's
         * latest data prevents the temporary Page used for re-registration callbacks from starting empty. This is an O(1)
         * reference assignment: it does not clone the recursive data tree, call `setData`, move React state, or rebind Taro. The
         * ordinary Taro lifecycle stays suppressed through re-registration onShow, so the existing React tree remains attached
         * to `mountedPage` and every later registration reads that Page's latest native data.
         */
        config.data = mountedPage.data

        return config
    }

    const originalOnUnload = config.onUnload
    const originalOnLoad = config.onLoad
    const originalOnShow = config.onShow

    /*
     * This mutable config-local state spans ordinary Page mount/unmount and one DevTools re-registration lifecycle. Lifecycle
     * wrappers close over this exact object, while a later `injectPageHmr(config)` retrieves it through the symbol and avoids
     * wrapping twice. Config-local ownership avoids route maps, runtime-global phase flags, and state shared by independent Page
     * registrations; the state becomes unreachable together with its static config.
     */
    const state: PageHmrState = {
        isReregistering: false,
        mountedPage: undefined
    }

    config[pageHmrStateKey] = state

    config.onUnload = function (this: NativePage, ...args: unknown[]) {
        if (state.isReregistering) {
            return
        }

        forward(originalOnUnload, this, args)
        state.mountedPage = undefined
    }

    config.onLoad = function (this: NativePage, ...args: unknown[]) {
        if (state.isReregistering) {
            return
        }

        forward(originalOnLoad, this, args)
        state.mountedPage = this
    }

    config.onShow = function (this: NativePage, ...args: unknown[]) {
        if (state.isReregistering) {
            // DevTools' synthetic unload/load/show cycle ends here. Consume the gate exactly once so the next real navigation
            // forwards ordinary Taro lifecycles instead of being mistaken for the same registration.
            state.isReregistering = false
            return
        }

        forward(originalOnShow, this, args)
    }

    return config
}
