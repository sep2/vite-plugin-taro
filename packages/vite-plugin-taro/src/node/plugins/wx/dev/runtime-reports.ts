import { buffer, debounceTime, filter, type SchedulerLike, Subject } from 'rxjs'

type AppliedReport = Readonly<{
    kind: 'applied'
    buildId: string
    seq: number
}>

/** The runtime hit an unrecoverable state and needs a complete build. */
type RebuildReport = Readonly<{
    kind: 'rebuild'
    buildId: string
    reason: string
}>

export type RuntimeReport = AppliedReport | RebuildReport

/**
 * Conflates runtime receipts without weakening their build identity or recovery semantics.
 *
 * Reports are metadata frontiers rather than executable deltas: for one build, the highest applied sequence subsumes lower and
 * duplicate acknowledgements. A rebuild does not subsume reports from a different build, because delayed Pages may still POST
 * after session rotation, but it dominates every acknowledgement for its own build. The host validates each retained build ID
 * against the active patch journal only when its serialized task executes, preserving rotation and publication order.
 *
 * Completing the Subject flushes the active window synchronously so shutdown can include its host task before closing Rolldown.
 * Reduction is O(reports) time and O(distinct builds) retained space per quiet window.
 */
export function createRuntimeReportsStream(
    settleMilliseconds: number,
    scheduler: SchedulerLike,
    publish: (reports: readonly RuntimeReport[]) => void
): Subject<RuntimeReport> {
    /*
     * This Subject is the sole mutable HTTP admission edge. Requests append reports synchronously and finish their responses;
     * buffer then owns the short-lived window while debounceTime supplies only its quiet-edge signal. Reports are metadata rather
     * than executable deltas, so the window may be reduced before entering hostActions. Directly mutating PatchJournal from the
     * request stack would race patch writes and build rotation; retaining every raw receipt beyond the window would grow with Page
     * count and duplicate acknowledgements. Completion flushes the final window during phased shutdown.
     */
    const reports = new Subject<RuntimeReport>()

    reports
        .pipe(
            buffer(reports.pipe(debounceTime(settleMilliseconds, scheduler))),
            filter((window) => window.length > 0)
        )
        .subscribe((window) => publish(reduceRuntimeReportWindow(window)))
    return reports
}

export function reduceRuntimeReportWindow(window: readonly RuntimeReport[]): readonly RuntimeReport[] {
    /*
     * This transaction-local mutable Map is bounded by distinct build IDs in one quiet window. Insertion order preserves causal
     * build order, while replacing a value conflates only that build's monotonic acknowledgement frontier; rebuild becomes its
     * terminal value. A single global latest report would let delayed Pages erase another build, and retaining the raw window
     * would make downstream work proportional to duplicate report volume. The Map is discarded immediately after reduction.
     */
    const reportsByBuild = new Map<string, RuntimeReport>()
    for (const report of window) {
        const previous = reportsByBuild.get(report.buildId)
        if (previous?.kind === 'rebuild') {
            continue
        }
        if (report.kind === 'rebuild' || previous === undefined || report.seq > previous.seq) {
            reportsByBuild.set(report.buildId, report)
        }
    }
    return [...reportsByBuild.values()]
}
