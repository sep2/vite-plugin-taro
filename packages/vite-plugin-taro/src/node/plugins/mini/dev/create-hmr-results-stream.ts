import type { DevOptions } from 'rolldown/experimental'
import { auditTime, buffer, filter, type SchedulerLike, Subject } from 'rxjs'

type HmrUpdatesResult = Parameters<NonNullable<DevOptions['onHmrUpdates']>>[0]
type HmrUpdates = Exclude<HmrUpdatesResult, Error>

/**
 * Adapts Rolldown's non-awaited HMR callback into lossless fixed-duration batch publications.
 *
 * Applying auditTime to the result stream itself would retain only the final callback and lose incremental patch factories
 * that later patches do not reproduce. Instead, it only closes `buffer`: the first meaningful callback starts one timed window,
 * and later callbacks join without postponing its deadline. No timer runs while idle. `publish` and `reportError` remain
 * synchronous admission callbacks so the dev host can enqueue both through its existing serialized writer.
 *
 * Empty and Noop-only callbacks are excluded from both the buffer and its closing notifier, so they cannot delay meaningful
 * work or enqueue empty publications. Mixed callbacks remain intact; the host still owns per-update selection.
 *
 * DevEngine failures are values, not Observable errors. They represent transient editor generations and carry no executable
 * patch, so the stream reports the final error but otherwise removes them. Successful callbacks on either side remain ordered
 * and lossless; Rolldown generated each against its unpublished client frontier, and the host delivers every retained payload.
 * Completing the returned Subject flushes its current buffer synchronously, allowing host shutdown to await the resulting
 * serialized task rather than silently dropping an admitted patch.
 *
 * Complexity is O(updates + changed files) per emitted window, with one retained reference per callback until its closing edge.
 */
export function createHmrResultsStream(
    batchMilliseconds: number,
    scheduler: SchedulerLike,
    publish: (result: HmrUpdates) => void,
    reportError: (error: Error) => void
): Subject<HmrUpdatesResult> {
    /*
     * This hot Subject is the sole mutable boundary between Rolldown's non-awaited callback and RxJS. Admitted generations are
     * preserved by reference and in arrival order. buffer owns the temporary lossless window; auditTime observes the same
     * filtered stream only to close it on time. Applying auditTime without buffering would discard patch factories,
     * while letting callback Promises mutate host state directly would overlap publications. Completion flushes the final window
     * before shutdown, after which the Subject is never reused.
     */
    const results = new Subject<HmrUpdatesResult>()

    const meaningfulResults = results.pipe(
        filter((result) => result instanceof Error || result.updates.some(({ update }) => update.type !== 'Noop'))
    )

    meaningfulResults
        .pipe(
            buffer(meaningfulResults.pipe(auditTime(batchMilliseconds, scheduler))),
            filter((window) => window.length > 0)
        )
        .subscribe((window) => {
            /*
             * An Error is one source generation that produced no executable delta; it does not invalidate successful Rolldown
             * callbacks already admitted on either side of it. Dropping the whole window would therefore discard real
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
