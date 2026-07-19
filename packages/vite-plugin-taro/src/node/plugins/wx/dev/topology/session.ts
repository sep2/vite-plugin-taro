import { filter, map, merge, type Observable, share, switchMap, take, takeUntil, withLatestFrom } from 'rxjs'
import { createBuildFlow$, isBuildCommand, isEpochReady } from './build-epochs.ts'
import { createClientPolls$, isAcceptedPoll, isClientRebuild } from './client-polls.ts'
import { createPatchHistory$ } from './patch-history.ts'
import type { BuildEpoch, HmrCommand, HmrFacts, RequestRebuildCommand, SafePatch, UpdatePoll } from './types.ts'
import { createUpdateCommands$ } from './update-publication.ts'

/**
 * Creates the complete pure WX HMR command topology.
 *
 * ```text
 * build/result facts → serialized build flow → ready epoch
 *                                              ├── retained safe-patch history
 * runtime polls ───────────────────────────────┼── one-client ownership
 * operation results ──────────────────────────┴── serialized physical update commands
 *
 * topology output: run-build | write-bootstrap | write-update | request-rebuild
 * ```
 *
 * The returned shared stream is the only output. Edge consumers subscribe to commands, perform the named operation, and
 * feed result facts back through the supplied streams. The topology itself performs no subscription and invokes no edge.
 */
export function createHmrTopology(
    {
        bootstrapWriteResults$,
        buildRequests$,
        completeBuildResults$,
        polls$,
        safePatches$,
        updateWriteResults$
    }: HmrFacts,
    { maximumPatchCount }: { maximumPatchCount: number }
): Observable<HmrCommand> {
    if (!Number.isSafeInteger(maximumPatchCount) || maximumPatchCount < 1) {
        throw new RangeError('maximumPatchCount must be a positive safe integer')
    }

    const buildFlow$ = createBuildFlow$({ bootstrapWriteResults$, buildRequests$, completeBuildResults$ })
    const buildCommands$ = buildFlow$.pipe(filter(isBuildCommand))
    const buildStarts$ = buildCommands$.pipe(
        filter((command) => command.kind === 'run-build'),
        share()
    )
    const readyEpochs$ = buildFlow$.pipe(
        filter(isEpochReady),
        map(({ epoch }) => epoch)
    )
    const epochCommands$ = readyEpochs$.pipe(
        switchMap((epoch) =>
            createEpochCommands$(
                epoch,
                buildStarts$,
                maximumPatchCount,
                polls$,
                safePatches$.pipe(
                    filter((fact) => fact.buildId === epoch.buildId),
                    map(({ patch }) => patch)
                ),
                updateWriteResults$
            )
        )
    )

    return merge(buildCommands$, epochCommands$).pipe(share())
}

/** Creates all command streams whose lifetime is exactly one successful build epoch. */
function createEpochCommands$(
    epoch: BuildEpoch,
    buildStarts$: Observable<unknown>,
    maximumPatchCount: number,
    polls$: Observable<UpdatePoll>,
    safePatches$: Observable<SafePatch>,
    updateWriteResults$: HmrFacts['updateWriteResults$']
): Observable<Extract<HmrCommand, { kind: 'request-rebuild' | 'write-update' }>> {
    const history$ = createPatchHistory$(safePatches$)
    const clientPolls$ = createClientPolls$(epoch, polls$)
    const acceptedPolls$ = clientPolls$.pipe(
        filter(isAcceptedPoll),
        map(({ poll }) => poll)
    )
    const clientChanged$ = clientPolls$.pipe(filter(isClientRebuild), take(1))
    const historyLimit$ = history$.pipe(
        filter(({ patches }) => patches.length >= maximumPatchCount),
        take(1),
        map(
            (): RequestRebuildCommand => ({
                buildId: epoch.buildId,
                kind: 'request-rebuild',
                reason: 'history-limit'
            })
        )
    )
    const desynchronized$ = acceptedPolls$.pipe(
        withLatestFrom(history$),
        filter(([poll, history]) => poll.appliedVersion < 0 || poll.appliedVersion > history.patches.length),
        take(1),
        map(
            (): RequestRebuildCommand => ({
                buildId: epoch.buildId,
                kind: 'request-rebuild',
                reason: 'runtime-desynchronized'
            })
        )
    )
    const localRebuild$ = merge(clientChanged$, historyLimit$, desynchronized$).pipe(take(1), share())
    const updateCommands$ = createUpdateCommands$({
        buildId: epoch.buildId,
        history$,
        polls$: acceptedPolls$,
        updateWriteResults$
    })

    return merge(updateCommands$.pipe(takeUntil(localRebuild$)), localRebuild$).pipe(takeUntil(buildStarts$))
}
