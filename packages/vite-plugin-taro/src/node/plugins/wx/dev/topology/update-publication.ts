import { concatMap, filter, map, type Observable, take } from 'rxjs'
import type { Bootstrap, PatchHistory, UpdatePoll, UpdatePublication, UpdatePublicationEffect } from './types.ts'

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
    bootstrap,
    history$,
    polls$,
    writePublication
}: {
    /** Immutable metadata embedded in every physical update projection. */
    bootstrap: Bootstrap
    /** Replayed append-only patch history for the current full build. */
    history$: Observable<PatchHistory>
    /** Version reports from the active runtime control channel. */
    polls$: Observable<UpdatePoll>
    /** Atomic physical update.js writer edge. */
    writePublication: UpdatePublicationEffect
}): Observable<UpdatePublication> {
    return polls$.pipe(
        filter((poll) => poll.buildId === bootstrap.buildId),
        concatMap((poll, index) =>
            history$.pipe(
                map((history) => selectPublication(bootstrap, poll, history, index + 1)),
                filter((publication): publication is UpdatePublication => publication !== undefined),
                take(1),
                concatMap((publication) => writePublication(publication).pipe(map(() => publication)))
            )
        )
    )
}

/** Selects every retained version strictly after the runtime's applied contiguous prefix. */
function selectPublication(
    bootstrap: Bootstrap,
    poll: UpdatePoll,
    history: PatchHistory,
    publicationId: number
): UpdatePublication | undefined {
    if (
        history.buildId !== bootstrap.buildId ||
        poll.appliedVersion < 0 ||
        poll.appliedVersion >= history.patches.length
    ) {
        return
    }

    return {
        bootstrap,
        clientId: poll.clientId,
        patches: history.patches.slice(poll.appliedVersion),
        publicationId
    }
}
