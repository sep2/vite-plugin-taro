import { catchError, concatMap, filter, map, type Observable, of, take } from 'rxjs'
import type {
    PatchHistory,
    UpdatePoll,
    UpdatePublication,
    UpdatePublicationResult,
    WritePublicationEffect
} from './types.ts'

/**
 * Materializes retained patches only in response to an accepted runtime poll.
 *
 * ```text
 * retained history ────────────────┐
 *                                  ▼
 * accepted poll(applied version) → select missing contiguous range → physical update.js
 *                                                                       │
 * WX page rerun ← executes range ←─────────────────────────────────────┘
 * ```
 *
 * DevEngine patches are intentionally absent. A poll at the current version waits for later history; an older poll
 * republishes its missing range with a new physical publication identity. Version desynchronization is detected and
 * terminates the enclosing session before it reaches this function.
 */
export function createUpdatePublications$({
    buildId,
    history$,
    polls$,
    writePublication
}: {
    /** Active epoch identity embedded in every physical update projection. */
    buildId: string
    /** Replayed append-only patch history scoped to the active epoch. */
    history$: Observable<PatchHistory>
    /** Polls already accepted for the active WX heap. */
    polls$: Observable<UpdatePoll>
    /** Atomic physical update.js writer edge. */
    writePublication: WritePublicationEffect
}): Observable<UpdatePublicationResult> {
    return polls$.pipe(
        filter((poll) => poll.buildId === buildId),
        concatMap((poll, index) =>
            history$.pipe(
                map((history) => selectPublication(buildId, poll, history, index + 1)),
                filter((publication): publication is UpdatePublication => publication !== undefined),
                take(1),
                concatMap((publication) =>
                    writePublication(publication).pipe(
                        map((): UpdatePublicationResult => ({ kind: 'update-published', publication })),
                        catchError((error: unknown) =>
                            of<UpdatePublicationResult>({ error, kind: 'update-write-failed', publication })
                        )
                    )
                )
            )
        )
    )
}

/** Selects every retained version strictly after the runtime's applied contiguous prefix. */
function selectPublication(
    buildId: string,
    poll: UpdatePoll,
    history: PatchHistory,
    publicationId: number
): UpdatePublication | undefined {
    if (poll.appliedVersion < 0 || poll.appliedVersion >= history.patches.length) {
        return
    }

    return {
        buildId,
        clientId: poll.clientId,
        patches: history.patches.slice(poll.appliedVersion),
        publicationId
    }
}
