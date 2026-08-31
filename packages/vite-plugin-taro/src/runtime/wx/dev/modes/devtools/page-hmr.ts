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
         * `Page(config)` reads `config.data` as the initial native view-model for this registration. The Page owns current app
         * and ordinary Page fields, while each mounted CustomWrapper owns the current snapshot below its native boundary. Join
         * those already-serialized snapshots before registration so WeChat never publishes the stale initial placeholder tree.
         * This lifecycle handoff performs no setData call and runs before React Refresh can publish another logical tree.
         */
        config.data = mountedPage.data

        applyCustomWrapperSnapshots(config.data)

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

type SnapshotRecord = Record<string, unknown>
type CustomWrapperCache = ReadonlyMap<string, Readonly<{ data: Readonly<{ i: SnapshotRecord }> }>>

const customWrapperCacheKey = Symbol.for('customWrapperCache')

/**
 * Replaces stale Page.data placeholders with each mounted CustomWrapper's current native snapshot in at most one O(n)
 * traversal. This mutates only the registration data before WeChat reads it; it performs no setData call and does not
 * inspect React.
 */
function applyCustomWrapperSnapshots(data: SnapshotRecord): void {
    const customWrapperCache: unknown = Reflect.get(global, customWrapperCacheKey)

    if (!(customWrapperCache instanceof Map)) {
        throw new Error('WX CustomWrapper cache is not installed in the App global.')
    }

    if (customWrapperCache.size === 0) {
        return
    }

    // This local mutable set lets the lazy traversal stop after every mounted wrapper snapshot has been consumed. Cache
    // entries owned by another mounted Page remain, naturally falling back to a complete traversal of this Page.
    const remainingSids: Set<string> = new Set(customWrapperCache.keys())

    for (const sid of materializeSnapshots(data, customWrapperCache)) {
        remainingSids.delete(sid)

        if (remainingSids.size === 0) {
            return
        }
    }
}

/** Lazily traverses the Page snapshot and yields each mounted CustomWrapper sid after replacing its stale node. */
function* materializeSnapshots(value: unknown, customWrapperCache: CustomWrapperCache): Generator<string, void> {
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++) {
            yield* replaceCustomWrapperSnapshot(value, index, customWrapperCache)
            yield* materializeSnapshots(value[index], customWrapperCache)
        }
    } else if (isRecord(value)) {
        for (const key in value) {
            yield* replaceCustomWrapperSnapshot(value, key, customWrapperCache)
            yield* materializeSnapshots(value[key], customWrapperCache)
        }
    }
}

/** Assigns a snapshot before yielding its sid, so closing the generator cannot discard the final replacement. */
function* replaceCustomWrapperSnapshot<Key extends string | number>(
    container: Record<Key, unknown>,
    key: Key,
    customWrapperCache: CustomWrapperCache
): Generator<string, void> {
    const value = container[key]

    if (!isRecord(value) || value.nn !== 'custom-wrapper' || typeof value.sid !== 'string') {
        return
    }

    const snapshot = customWrapperCache.get(value.sid)?.data.i
    if (!snapshot) {
        return
    }

    container[key] = snapshot

    yield value.sid
}

function isRecord(value: unknown): value is SnapshotRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
