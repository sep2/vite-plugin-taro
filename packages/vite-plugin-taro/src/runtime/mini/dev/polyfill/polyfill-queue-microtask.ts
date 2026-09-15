type QueueMicrotask = (callback: () => void) => void

type QueueMicrotaskGlobal = {
    queueMicrotask?: QueueMicrotask
}

/**
 * Provides the microtask primitive required by generated development React Refresh boundaries.
 *
 * Supported Mini Program engines provide Promise jobs but do not share a queueMicrotask baseline.
 * Reusing one resolved Promise preserves FIFO ordering without adding core-js or production code.
 */
export function polyfillQueueMicrotask(runtimeGlobal: QueueMicrotaskGlobal): void {
    if (runtimeGlobal.queueMicrotask !== undefined) {
        return
    }

    const resolvedPromise = Promise.resolve()

    // This intentional global mutation shares one host queue between native chunks and interpreted HMR patches.
    runtimeGlobal.queueMicrotask = (callback) => {
        void resolvedPromise.then(callback)
    }
}
