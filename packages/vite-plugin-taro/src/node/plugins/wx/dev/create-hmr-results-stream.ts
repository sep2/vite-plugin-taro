import type { DevOptions } from 'rolldown/experimental'
import { buffer, debounceTime, filter, type SchedulerLike, Subject } from 'rxjs'

type HmrUpdatesResult = Parameters<NonNullable<DevOptions['onHmrUpdates']>>[0]
type HmrUpdates = Exclude<HmrUpdatesResult, Error>

/**
 * Adapts Rolldown's non-awaited HMR callback into lossless quiet-window publications.
 *
 * Debouncing the result stream itself would retain only the final callback and lose incremental patch factories that later
 * patches provably do not reproduce. Instead, the debounced view is only a closing notifier for `buffer`: every callback is
 * retained in arrival order, and one configured quiet period emits the complete window to the host's existing serialized
 * writer. This first stream migration deliberately does not own physical state; `publish` and `rebuild` remain synchronous
 * admission callbacks so the dev host can enqueue both through its single writer.
 *
 * DevEngine failures are values, not Observable errors. One failure dominates its complete window because publishing any
 * neighboring incremental patch before recovery could expose a generation whose missing factory can never be reconstructed.
 * Completing the returned Subject flushes its current buffer synchronously, allowing host shutdown to await the resulting
 * serialized task rather than silently dropping an admitted patch.
 *
 * Complexity is O(updates + changed files) per emitted window, with one retained reference per callback until the quiet edge.
 */
export function createHmrResultsStream(
    settleMilliseconds: number,
    scheduler: SchedulerLike,
    publish: (result: HmrUpdates) => void,
    rebuild: (error: Error) => void
): Subject<HmrUpdatesResult> {
    // This hot Subject is the sole mutable admission edge. Both buffer subscriptions observe the same callback identities:
    // one stores them losslessly, while the debounced subscription emits only the signal that closes that stored window.
    const results = new Subject<HmrUpdatesResult>()

    results
        .pipe(
            buffer(results.pipe(debounceTime(settleMilliseconds, scheduler))),
            filter((window) => window.length > 0)
        )
        .subscribe((window) => {
            // These transaction-local collections retain lossless callback order and first-seen changed-file order. A Set
            // removes duplicate physical files without changing their semantic order for the later style-invalidation stream.
            const updates: HmrUpdates['updates'] = []
            const changedFiles = new Set<string>()
            for (const result of window) {
                if (result instanceof Error) {
                    // Do not publish the successful prefix or suffix. Recovery establishes a new complete build generation.
                    rebuild(result)
                    return
                }
                updates.push(...result.updates)
                result.changedFiles.forEach((file) => {
                    changedFiles.add(file)
                })
            }
            // Array append order is callback order and then Rolldown's own per-callback update order; no patch is sorted,
            // deduplicated, or replaced by a later patch.
            publish({ updates: updates, changedFiles: [...changedFiles] })
        })
    return results
}
