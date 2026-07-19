import { filter, map, type Observable, scan, share } from 'rxjs'
import type { BuildEpoch, RebuildSignal, UpdatePoll } from './types.ts'

export type ClientPollEvent =
    | Readonly<{
          kind: 'accepted-poll'
          poll: UpdatePoll
      }>
    | RebuildSignal

/**
 * Establishes one WX heap as the only poll source for an active build epoch.
 *
 * ```text
 * first matching-build poll → active client
 * same client poll          → accepted poll
 * different client poll     → rebuild signal
 * ```
 *
 * A different client is never forwarded to update publication, so the topology cannot accidentally multiplex physical
 * update.js delivery across heaps. The enclosing session takes the first rebuild signal and ends the epoch immediately.
 */
export function createClientPollEvents$(
    epoch: BuildEpoch,
    polls$: Observable<UpdatePoll>
): Observable<ClientPollEvent> {
    return polls$.pipe(
        filter((poll) => poll.buildId === epoch.buildId),
        scan((state, poll): ClientPollState => {
            if (state.clientId === undefined || state.clientId === poll.clientId) {
                return {
                    clientId: poll.clientId,
                    event: { kind: 'accepted-poll', poll }
                }
            }

            return {
                ...state,
                event: { buildId: epoch.buildId, kind: 'rebuild-needed', reason: 'client-changed' }
            }
        }, {} as ClientPollState),
        map(({ event }) => event),
        filter((event): event is ClientPollEvent => event !== undefined),
        share()
    )
}

type ClientPollState = Readonly<{
    clientId?: string
    event?: ClientPollEvent
}>
