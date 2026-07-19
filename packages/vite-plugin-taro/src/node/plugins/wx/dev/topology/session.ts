import { filter, map, merge, type Observable, share, switchMap, take, takeUntil, withLatestFrom } from 'rxjs'
import { createBuildEvents$ } from './build-epochs.ts'
import { type ClientPollEvent, createClientPollEvents$ } from './client-polls.ts'
import { createPatchHistory$ } from './patch-history.ts'
import type {
    BuildEpoch,
    BuildEvent,
    BuildRequest,
    CompleteBuildEffect,
    EpochEvent,
    HmrEvent,
    RebuildSignal,
    SafePatchSource,
    UpdatePoll,
    WriteBootstrapEffect,
    WritePublicationEffect
} from './types.ts'
import { createUpdatePublications$ } from './update-publication.ts'

/**
 * The complete pure WX HMR topology.
 *
 * ```text
 * build requests → serialized build events → ready epoch → history + one-client polls → update publications
 *                                  │                    │               │
 *                                  │                    │               └── local rebuild signal
 *                                  │                    └── stops on any rebuild boundary
 *                                  └── emits start, ready, or failure
 * ```
 *
 * Subscribe once to the returned event stream. Its single lifetime owns all retained history, active-client identity,
 * physical update publication, and rebuild boundaries; no DevHost field, response map, queue, or timer coordinates
 * them.
 */
export function createHmrTopology({
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
    /** Maximum retained safe patches before the epoch stops and asks for a replacement baseline. */
    maximumPatchCount: number
    /** Runtime control reports from every connected WX heap. */
    polls$: Observable<UpdatePoll>
    /** Build-scoped safe DevEngine patch source. */
    safePatchesForEpoch: SafePatchSource
    /** HMR bootstrap materialization after complete output. */
    writeBootstrap: WriteBootstrapEffect
    /** Poll-driven atomic update.js writer edge. */
    writePublication: WritePublicationEffect
}): Observable<HmrEvent> {
    if (!Number.isSafeInteger(maximumPatchCount) || maximumPatchCount < 1) {
        throw new RangeError('maximumPatchCount must be a positive safe integer')
    }

    const buildEvents$ = createBuildEvents$({ buildRequests$, completeBuild, writeBootstrap })
    const buildStarts$ = buildEvents$.pipe(filter(isBuildStarted), share())
    const readyEpochs$ = buildEvents$.pipe(
        filter(isBuildReady),
        map(({ epoch }) => epoch),
        share()
    )
    const epochEvents$ = readyEpochs$.pipe(
        switchMap((epoch) =>
            createEpochEvents$(epoch, buildStarts$, maximumPatchCount, polls$, safePatchesForEpoch, writePublication)
        )
    )

    return merge(buildEvents$, epochEvents$).pipe(share())
}

/** Creates every HMR stream whose lifetime is exactly one successful build epoch. */
function createEpochEvents$(
    epoch: BuildEpoch,
    buildStarts$: Observable<unknown>,
    maximumPatchCount: number,
    polls$: Observable<UpdatePoll>,
    safePatchesForEpoch: SafePatchSource,
    writePublication: WritePublicationEffect
): Observable<EpochEvent> {
    const history$ = createPatchHistory$(safePatchesForEpoch(epoch))
    const clientPollEvents$ = createClientPollEvents$(epoch, polls$)
    const acceptedPolls$ = clientPollEvents$.pipe(
        filter((event): event is Extract<ClientPollEvent, { kind: 'accepted-poll' }> => event.kind === 'accepted-poll'),
        map(({ poll }) => poll)
    )
    const clientChanged$ = clientPollEvents$.pipe(
        filter((event): event is RebuildSignal => event.kind === 'rebuild-needed'),
        take(1)
    )
    const historyLimit$ = history$.pipe(
        filter(({ patches }) => patches.length >= maximumPatchCount),
        take(1),
        map((): RebuildSignal => ({ buildId: epoch.buildId, kind: 'rebuild-needed', reason: 'history-limit' }))
    )
    const desynchronized$ = acceptedPolls$.pipe(
        withLatestFrom(history$),
        filter(([poll, history]) => poll.appliedVersion < 0 || poll.appliedVersion > history.patches.length),
        take(1),
        map((): RebuildSignal => ({ buildId: epoch.buildId, kind: 'rebuild-needed', reason: 'runtime-desynchronized' }))
    )
    const localRebuild$ = merge(clientChanged$, historyLimit$, desynchronized$).pipe(take(1), share())
    const nonTerminalEvents$ = merge(
        history$.pipe(map((history): EpochEvent => ({ epoch, history, kind: 'history-retained' }))),
        createUpdatePublications$({
            buildId: epoch.buildId,
            history$,
            polls$: acceptedPolls$,
            writePublication
        })
    )

    return merge(nonTerminalEvents$.pipe(takeUntil(localRebuild$)), localRebuild$).pipe(takeUntil(buildStarts$))
}

function isBuildStarted(event: BuildEvent): event is Extract<BuildEvent, { kind: 'build-started' }> {
    return event.kind === 'build-started'
}

function isBuildReady(event: BuildEvent): event is Extract<BuildEvent, { kind: 'build-ready' }> {
    return event.kind === 'build-ready'
}
