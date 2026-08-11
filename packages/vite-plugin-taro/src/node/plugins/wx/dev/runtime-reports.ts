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
 * against the physical publisher only when its serialized task executes, preserving rotation order.
 *
 * Completing the Subject flushes the active window synchronously so shutdown can include its host task before closing Rolldown.
 * Reduction is O(reports) time and O(distinct builds) retained space per quiet window.
 */
export function createRuntimeReportsStream(
    settleMilliseconds: number,
    scheduler: SchedulerLike,
    publish: (reports: readonly RuntimeReport[]) => void
): Subject<RuntimeReport> {
    // The Subject is the sole mutable HTTP admission edge; the debounced branch only closes the lossless report buffer.
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
    // Map insertion order preserves first-seen build order while each value stores only that build's strongest frontier.
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
