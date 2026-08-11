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
 * writer. This first stream migration deliberately does not own physical state; `publish` and `reportError` remain synchronous
 * admission callbacks so the dev host can enqueue both through its single writer.
 *
 * DevEngine failures are values, not Observable errors. They represent transient editor generations and carry no executable
 * patch, so the stream reports the final error but otherwise removes them. Successful callbacks on either side remain ordered
 * and lossless; Rolldown generated each against its unpublished client frontier, and the host delivers every retained payload.
 * Completing the returned Subject flushes its current buffer synchronously, allowing host shutdown to await the resulting
 * serialized task rather than silently dropping an admitted patch.
 *
 * Complexity is O(updates + changed files) per emitted window, with one retained reference per callback until the quiet edge.
 */
export function createHmrResultsStream(
    settleMilliseconds: number,
    scheduler: SchedulerLike,
    publish: (result: HmrUpdates) => void,
    reportError: (error: Error) => void
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
            /*
             * An Error is one source generation that produced no executable delta; it does not invalidate successful Rolldown
             * callbacks already admitted on either side of it. Dropping the whole quiet window would therefore discard real
             * patch factories, while starting a complete build would compile the same known-invalid editor contents. Keep the
             * old runtime running, report only the latest diagnostic from a repeated parser burst, and continue below with the
             * successful callback values exactly as if the temporary invalid save had never produced an HMR payload.
             */
            const lastFailure = window.findLast((result): result is Error => result instanceof Error)
            if (lastFailure) {
                reportError(lastFailure)
            }
            const successfulWindow = window.filter((result): result is HmrUpdates => !(result instanceof Error))
            if (successfulWindow.length > 0) {
                /*
                 * flatMap preserves callback arrival order and each callback's internal Rolldown order. Updates must not be
                 * deduplicated: later undelivered patches are deltas and do not reproduce factories from earlier sequences.
                 * changedFiles is opaque DevEngine metadata and has no identity semantics in the host, so preserving its raw
                 * concatenation is both cheaper and more faithful than maintaining a second Set-based interpretation here.
                 */
                publish({
                    updates: successfulWindow.flatMap((result) => result.updates),
                    changedFiles: successfulWindow.flatMap((result) => result.changedFiles)
                })
            }
        })
    return results
}
