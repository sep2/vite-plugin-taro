import { catchError, concatMap, defer, EMPTY, lastValueFrom, Subject } from 'rxjs'

type ActionEnvelope<Action> =
    | Readonly<{ kind: 'action'; action: Action }>
    | Readonly<{ kind: 'barrier'; resolve: () => void }>

export type HostActions<Action> = Readonly<{
    complete: () => Promise<void>
    next: (action: Action) => void
    waitForIdle: () => Promise<void>
}>

/**
 * Executes semantic host actions one at a time while keeping source admission synchronous.
 *
 * `concatMap` is the sole effect serializer: each deferred reducer call starts only after the prior Promise settles. Errors are
 * converted to empty inner streams so one failed physical transaction is reported without terminating later host actions.
 * Barrier envelopes participate in the same ordering but run no effect; resolving one proves every action admitted before it
 * has settled. Completing the source drains already-admitted effects and gives shutdown one Promise for final quiescence.
 */
export function createHostActions<Action>(
    apply: (action: Action) => void | Promise<void>,
    reportError: (action: Action, error: unknown) => void
): HostActions<Action> {
    // This Subject is the one mutable action-admission edge. Ordering state itself belongs to concatMap's subscription.
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
        waitForIdle() {
            const barrier = Promise.withResolvers<void>()
            envelopes.next({ kind: 'barrier', resolve: barrier.resolve })
            return barrier.promise
        }
    }
}
