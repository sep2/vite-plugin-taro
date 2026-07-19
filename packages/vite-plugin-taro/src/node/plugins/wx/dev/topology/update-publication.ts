import { concatMap, filter, ignoreElements, map, merge, type Observable, of, take } from 'rxjs'
import type { PatchHistory, UpdatePoll, UpdatePublication, UpdateWriteResult, WriteUpdateCommand } from './types.ts'

/**
 * Selects and serializes physical update commands from accepted polls and retained history.
 *
 * ```text
 * retained history ────────────────┐
 *                                  ▼
 * accepted poll(applied version) → missing range → write-update command → wait for write-result fact
 *                                                                            │
 * next poll may retry an unchanged applied version after either result ──────┘
 * ```
 *
 * A current-version poll waits for later history. Repeating an older version emits a new publication identity for the
 * same missing range. Waiting for each result prevents overlapping physical writes without invoking the writer here. The
 * result listener is established before its command is exposed, so synchronous edge feedback is not lost.
 */
export function createUpdateCommands$({
    buildId,
    history$,
    polls$,
    updateWriteResults$
}: {
    /** Active build identity embedded in every publication. */
    buildId: string
    /** Replayed append-only patch history scoped to the active epoch. */
    history$: Observable<PatchHistory>
    /** Polls already accepted for the active WX heap and validated against history. */
    polls$: Observable<UpdatePoll>
    /** Result facts that release serialized update-command processing. */
    updateWriteResults$: Observable<UpdateWriteResult>
}): Observable<WriteUpdateCommand> {
    return polls$.pipe(
        filter((poll) => poll.buildId === buildId),
        concatMap((poll, index) =>
            history$.pipe(
                map((history) => selectPublication(buildId, poll, history, index + 1)),
                filter((publication): publication is UpdatePublication => publication !== undefined),
                take(1),
                concatMap((publication) =>
                    merge(
                        updateWriteResults$.pipe(
                            filter(
                                (result) =>
                                    result.buildId === publication.buildId &&
                                    result.publicationId === publication.publicationId &&
                                    result.requestId === publication.requestId
                            ),
                            take(1),
                            ignoreElements()
                        ),
                        of<WriteUpdateCommand>({ kind: 'write-update', publication })
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
        publicationId,
        requestId: poll.requestId
    }
}
