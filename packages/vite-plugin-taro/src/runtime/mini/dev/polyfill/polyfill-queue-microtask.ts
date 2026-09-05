type QueueMicrotask = (callback: () => void) => void

type QueueMicrotaskGlobal = {
    queueMicrotask?: QueueMicrotask
}

/**
 * Polyfills the microtask primitive required by Rolldown's development React Refresh boundaries.
 *
 * Mini Program AppService engines do not share a `queueMicrotask` compatibility baseline, while every supported engine provides
 * Promise jobs. Every target adapter constructs its selected development runtime before any application factory evaluates, so
 * defining the primitive there covers WX and ZFB in every development mode. Reusing one resolved Promise preserves FIFO ordering
 * without rewriting generated modules, delaying registration to a timer task, or adding unused code to production builds.
 */
export function polyfillQueueMicrotask(runtimeGlobal: QueueMicrotaskGlobal): void {
    if (runtimeGlobal.queueMicrotask !== undefined) return

    const resolvedPromise = Promise.resolve()

    // This is the one intentional global mutation: every independently bundled development chunk must resolve the same host
    // primitive, and assigning the real global is the only scope shared by the injected runtime and later application factories.
    runtimeGlobal.queueMicrotask = (callback) => {
        void resolvedPromise.then(callback)
    }
}
