import { catchError, concatMap, defer, EMPTY, filter, firstValueFrom, lastValueFrom, map, Subject } from 'rxjs'

type ActionEnvelope<Action> =
    | Readonly<{ kind: 'action'; action: Action }>
    | Readonly<{ kind: 'barrier'; resolve: () => void }>

export type HostActions<Action> = Readonly<{
    complete: () => Promise<void>
    next: (action: Action) => void
    waitForAction: <Selected extends Action>(select: (action: Action) => action is Selected) => Promise<Selected>
    waitForIdle: () => Promise<void>
}>

/**
 * Executes semantic host actions one at a time while keeping source admission synchronous.
 *
 * `concatMap` is the sole effect serializer: each deferred reducer call starts only after the prior Promise settles. Errors are
 * converted to empty inner streams so one failed physical transaction is reported without terminating later host actions.
 * Barrier envelopes participate in the same ordering but run no effect; resolving one proves every action admitted before it
 * has settled. `waitForAction` observes this same admission edge for lifecycle gates without introducing a forwarding Subject.
 * Completing the source drains already-admitted effects and gives shutdown one Promise for final quiescence.
 */
export function createHostActions<Action>(
    apply: (action: Action) => void | Promise<void>,
    reportError: (action: Action, error: unknown) => void
): HostActions<Action> {
    /*
     * This Subject is the host's only mutable admission edge. Independent callback stacks synchronously append semantic actions
     * or barriers; concatMap owns the queued ordering and admits exactly one asynchronous effect at a time. A Promise chain would
     * require mutation at every producer and is permanently rejected after one failure, while mergeMap could overlap physical
     * writes and build rotation. The Subject retains no business frontier itself and is completed only after all external sources
     * are quiescent, allowing lastValueFrom to prove the final queued effect settled.
     */
    const envelopes = new Subject<ActionEnvelope<Action>>()

    const completion = lastValueFrom(
        envelopes.pipe(
            concatMap((envelope) => {
                if (envelope.kind === 'barrier') {
                    return defer(() => {
                        envelope.resolve()
                        return EMPTY
                    })
                }
                return defer(() => Promise.resolve(apply(envelope.action))).pipe(
                    catchError((error: unknown) => {
                        reportError(envelope.action, error)
                        return EMPTY
                    })
                )
            })
        ),
        { defaultValue: undefined }
    )

    return {
        complete: async () => {
            envelopes.complete()
            await completion
        },
        next(action) {
            envelopes.next({ kind: 'action', action: action })
        },
        waitForAction(select) {
            /*
             * Subscribe to the multicast admission Subject rather than creating another lifecycle source. Barrier envelopes are
             * internal ordering controls, so expose only semantic actions and let the caller's type guard select its milestone.
             * firstValueFrom unsubscribes after the match; concatMap's independent subscription still applies the same action.
             */
            return firstValueFrom(
                envelopes.pipe(
                    filter((envelope) => envelope.kind === 'action'),
                    map((envelope) => envelope.action),
                    filter(select)
                )
            )
        },
        waitForIdle() {
            /*
             * The resolver is one transaction-local mutable latch. Enqueuing it behind ordinary actions makes resolution mean
             * every earlier effect settled, without completing the shared source needed by final DevEngine output callbacks.
             */
            const barrier = Promise.withResolvers<void>()
            envelopes.next({ kind: 'barrier', resolve: barrier.resolve })
            return barrier.promise
        }
    }
}
