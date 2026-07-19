import { concatMap, filter, map, type Observable, take } from 'rxjs'
import type { BuildEpoch, PatchHistory, UpdatePoll, UpdatePublication, WritePublicationEffect } from './types.ts'

/**
 * Materializes retained patches only in response to an active runtime poll.
 *
 * ```text
 * retained history ────────────────┐
 *                                  ▼
 * runtime poll(appliedVersion) → select missing contiguous range → physical update.js
 *                                                                    │
 * WX page rerun ← executes range ←──────────────────────────────────┘
 *       │
 *       └── next poll(new appliedVersion) confirms execution
 * ```
 *
 * The DevEngine patch stream is intentionally absent from this function. New patches change history but cannot write
 * update.js until a runtime poll observes that the client is behind.
 */
export function createUpdatePublications$({
    epoch,
    history$,
    polls$,
    writePublication
}: {
    /** Successful build epoch embedded in every physical update projection. */
    epoch: BuildEpoch
    /** Replayed append-only patch history for the current full build. */
    history$: Observable<PatchHistory>
    /** Version reports from the active runtime control channel. */
    polls$: Observable<UpdatePoll>
    /** Atomic physical update.js writer edge. */
    writePublication: WritePublicationEffect
}): Observable<UpdatePublication> {
    return polls$.pipe(
        filter((poll) => poll.buildId === epoch.buildId),
        concatMap((poll, index) =>
            history$.pipe(
                map((history) => selectPublication(epoch, poll, history, index + 1)),
                filter((publication): publication is UpdatePublication => publication !== undefined),
                take(1),
                concatMap((publication) => writePublication(publication).pipe(map(() => publication)))
            )
        )
    )
}

/** Selects every retained version strictly after the runtime's applied contiguous prefix. */
function selectPublication(
    epoch: BuildEpoch,
    poll: UpdatePoll,
    history: PatchHistory,
    publicationId: number
): UpdatePublication | undefined {
    if (history.buildId !== epoch.buildId || poll.appliedVersion < 0 || poll.appliedVersion >= history.patches.length) {
        return
    }

    return {
        epoch,
        clientId: poll.clientId,
        patches: history.patches.slice(poll.appliedVersion),
        publicationId
    }
}
