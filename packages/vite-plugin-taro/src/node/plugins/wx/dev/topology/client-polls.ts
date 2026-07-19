import { filter, map, type Observable, scan, share } from 'rxjs'
import type { BuildEpoch, RequestRebuildCommand, UpdatePoll } from './types.ts'

export type ClientPollValue = AcceptedPoll | RequestRebuildCommand

type AcceptedPoll = Readonly<{
    kind: 'accepted-poll'
    poll: UpdatePoll
}>

type ClientPollState = Readonly<{
    clientId?: string
    value?: ClientPollValue
}>

/**
 * Establishes one WX heap as the only poll source for an active build epoch.
 *
 * ```text
 * first matching-build poll → active client
 * same client poll          → accepted poll
 * different client poll     → request-rebuild
 * ```
 *
 * A different client is never forwarded to update selection. The enclosing epoch flow emits its rebuild command once
 * and terminates immediately.
 */
export function createClientPolls$(epoch: BuildEpoch, polls$: Observable<UpdatePoll>): Observable<ClientPollValue> {
    return polls$.pipe(
        filter((poll) => poll.buildId === epoch.buildId),
        scan((state, poll): ClientPollState => {
            if (state.clientId === undefined || state.clientId === poll.clientId) {
                return {
                    clientId: poll.clientId,
                    value: { kind: 'accepted-poll', poll }
                }
            }

            return {
                ...state,
                value: { buildId: epoch.buildId, kind: 'request-rebuild', reason: 'client-changed' }
            }
        }, {} as ClientPollState),
        map(({ value }) => value),
        filter((value): value is ClientPollValue => value !== undefined),
        share()
    )
}

export function isAcceptedPoll(value: ClientPollValue): value is AcceptedPoll {
    return value.kind === 'accepted-poll'
}

export function isClientRebuild(value: ClientPollValue): value is RequestRebuildCommand {
    return value.kind === 'request-rebuild'
}
