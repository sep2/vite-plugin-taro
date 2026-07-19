import { from, map, mergeMap, type Observable, scan, shareReplay, skip, startWith } from 'rxjs'
import {
    createInitialDevProtocolState,
    type DevProtocolCommand,
    type DevProtocolEvent,
    type DevProtocolState,
    type DevProtocolTransition
} from './model.ts'
import { transition } from './transition.ts'

/**
 * Observable inputs needed to create one development-protocol stream.
 *
 * `events$` is supplied by the future DevHost composition layer, which merges Vite, Rolldown, HTTP, filesystem, and
 * effect-completion sources. The protocol itself has no subject, callback, or host dependency.
 */
export type DevProtocolStreamOptions = Readonly<{
    /** Stable identity shared by the initial lifecycle state and later physical HMR metadata. */
    buildId: string
    /** Ordered facts delivered to the pure lifecycle reducer. */
    events$: Observable<DevProtocolEvent>
}>

/**
 * Observable views of one development-protocol execution.
 *
 * `state$` replays the latest lifecycle state for late observers. `commands$` deliberately does not replay: an effect
 * that starts later must wait for future commands rather than repeat a completed physical write or rebuild.
 */
export type DevProtocolStreams = Readonly<{
    /** Current lifecycle state, beginning with `starting`. */
    state$: Observable<DevProtocolState>
    /** Future declarative effects requested by lifecycle transitions. */
    commands$: Observable<DevProtocolCommand>
}>

/**
 * Connects an event observable to the pure protocol reducer.
 *
 * This is the only RxJS bridge around the reducer. It shares one transition stream between state observers and command
 * executors, so every event is reduced once regardless of how many consumers observe the two public streams.
 */
export function createDevProtocol({ buildId, events$ }: DevProtocolStreamOptions): DevProtocolStreams {
    const initial: DevProtocolTransition = {
        state: createInitialDevProtocolState(buildId),
        commands: [] as readonly DevProtocolCommand[]
    }
    const transitions$ = events$.pipe(
        scan((previous, event) => transition(previous.state, event), initial),
        startWith(initial),
        shareReplay({ bufferSize: 1, refCount: false })
    )

    return {
        state$: transitions$.pipe(map(({ state }) => state)),
        commands$: transitions$.pipe(
            // The replayed transition establishes a subscriber's current position; only later transitions may execute work.
            skip(1),
            mergeMap(({ commands }) => from(commands))
        )
    }
}
