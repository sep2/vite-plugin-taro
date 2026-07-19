import { filter, map, merge, type Observable, share, switchMap, take, takeUntil } from 'rxjs'
import { createBuildLifecycle$ } from './full-build.ts'
import { createPatchHistory$ } from './patch-history.ts'
import type {
    BuildEpoch,
    BuildLifecycle,
    BuildRequest,
    CompleteBuildEffect,
    EpochHistory,
    EpochPublication,
    EpochTopologyValue,
    HistoryLimitReached,
    HmrTopology,
    SafePatchSource,
    UpdatePoll,
    WriteBootstrapEffect,
    WritePublicationEffect
} from './types.ts'
import { createUpdatePublications$ } from './update-publication.ts'

/**
 * Composes complete build epochs, build-scoped patch history, and client-poll-driven update publication.
 *
 * ```text
 * buildRequests$ ──> build lifecycle ──> successful epoch ──> patch history ──> poll publication
 *       │                    │                    │                 │                  │
 *       │                    │                    │                 │                  └── physical update.js
 *       │                    │                    │                 └── history-limit fact
 *       │                    │                    └── replaces every prior epoch scope
 *       │                    └── build failure fact
 *       └── starts a boundary that ends the prior history/publication scope immediately
 * ```
 *
 * `build-started` terminates the prior successful epoch before the replacement build completes. A failed rebuild therefore
 * leaves no patch publication path attached to potentially partial physical output; the next build request creates the
 * next attempt without a retry timer.
 */
export function createHmrTopology$({
    buildRequests$,
    completeBuild,
    maximumPatchCount,
    polls$,
    safePatchesForEpoch,
    writeBootstrap,
    writePublication
}: {
    /** Initial and later edge-created complete-build requests. */
    buildRequests$: Observable<BuildRequest>
    /** Complete physical DevEngine build effect. */
    completeBuild: CompleteBuildEffect
    /** Maximum retained safe patches before the topology emits a history-limit fact. */
    maximumPatchCount: number
    /** Version reports from the active runtime control edge. */
    polls$: Observable<UpdatePoll>
    /** Build-scoped safe DevEngine patch source. */
    safePatchesForEpoch: SafePatchSource
    /** HMR bootstrap writer effect. */
    writeBootstrap: WriteBootstrapEffect
    /** Poll-driven atomic update.js writer effect. */
    writePublication: WritePublicationEffect
}): HmrTopology {
    const builds$ = createBuildLifecycle$({ buildRequests$, completeBuild, writeBootstrap })
    const buildStarts$ = builds$.pipe(
        filter((build): build is Extract<BuildLifecycle, { kind: 'started' }> => build.kind === 'started'),
        share()
    )
    const epochs$ = builds$.pipe(
        filter((build): build is Extract<BuildLifecycle, { kind: 'succeeded' }> => build.kind === 'succeeded'),
        map(({ epoch }) => epoch),
        share()
    )
    const failures$ = builds$.pipe(
        filter((build): build is Extract<BuildLifecycle, { kind: 'failed' }> => build.kind === 'failed'),
        map(({ failure }) => failure),
        share()
    )
    const epochValues$ = epochs$.pipe(
        switchMap((epoch) =>
            createEpochTopology$(epoch, buildStarts$, maximumPatchCount, polls$, safePatchesForEpoch, writePublication)
        ),
        share()
    )

    return {
        builds$,
        epochs$,
        failures$,
        histories$: epochValues$.pipe(
            filter((value): value is Extract<EpochTopologyValue, { kind: 'history' }> => value.kind === 'history'),
            map(({ value }) => value)
        ),
        historyLimits$: epochValues$.pipe(
            filter(
                (value): value is Extract<EpochTopologyValue, { kind: 'history-limit' }> =>
                    value.kind === 'history-limit'
            ),
            map(({ value }) => value)
        ),
        publications$: epochValues$.pipe(
            filter(
                (value): value is Extract<EpochTopologyValue, { kind: 'publication' }> => value.kind === 'publication'
            ),
            map(({ value }) => value)
        )
    }
}

/** Creates every stream that must live only until the next complete-build boundary starts. */
function createEpochTopology$(
    epoch: BuildEpoch,
    buildStarts$: Observable<unknown>,
    maximumPatchCount: number,
    polls$: Observable<UpdatePoll>,
    safePatchesForEpoch: SafePatchSource,
    writePublication: WritePublicationEffect
): Observable<EpochTopologyValue> {
    const history$ = createPatchHistory$(epoch, safePatchesForEpoch(epoch))
    const epochHistory$ = history$.pipe(map((history): EpochHistory => ({ epoch, history })))
    const publications$ = createUpdatePublications$({
        epoch,
        history$,
        polls$,
        writePublication
    }).pipe(map((publication): EpochPublication => ({ epoch, publication })))
    const historyLimits$ = epochHistory$.pipe(
        filter(({ history }) => history.patches.length >= maximumPatchCount),
        take(1),
        map((value): HistoryLimitReached => value)
    )

    return merge(
        epochHistory$.pipe(map((value): EpochTopologyValue => ({ kind: 'history', value }))),
        historyLimits$.pipe(map((value): EpochTopologyValue => ({ kind: 'history-limit', value }))),
        publications$.pipe(map((value): EpochTopologyValue => ({ kind: 'publication', value })))
    ).pipe(takeUntil(buildStarts$))
}
