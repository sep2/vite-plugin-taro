/**
 * The protocol state before the physical WX project is ready to accept a runtime.
 *
 * `buildId` is generated once for the DevHost process and identifies its physical output session. It remains stable when
 * a client replacement triggers a full rebuild.
 */
export type StartingState = Readonly<{
    /** Stable identity of this physical DevHost session. */
    buildId: string
    phase: 'starting'
}>

/**
 * The physical project is ready, but no WX JavaScript heap has registered yet.
 *
 * The next valid client becomes the sole active client. Supporting multiple simultaneous heaps is intentionally outside
 * this protocol: a different heap always starts a full rebuild.
 */
export type AwaitingClientState = Readonly<{
    /** Stable identity of this physical DevHost session. */
    buildId: string
    phase: 'awaiting-client'
}>

/**
 * The one WX JavaScript heap currently synchronized with the physical project output.
 *
 * Ordinary HMR will later be scoped to this client. A new client ID is a new heap rather than a second subscriber.
 */
export type ActiveClientState = Readonly<{
    /** Stable identity of this physical DevHost session. */
    buildId: string
    /** Runtime-generated identity of the one heap allowed to receive HMR work. */
    clientId: string
    phase: 'active'
}>

/**
 * A complete physical rebuild is replacing the prior runtime baseline for a new WX heap.
 *
 * `nextClientId` is retained so successful rebuilding can adopt that heap without treating it as a second client.
 */
export type RebuildingState = Readonly<{
    /** Stable identity of this physical DevHost session. */
    buildId: string
    /** Identity of the heap that caused this full rebuild. */
    nextClientId: string
    phase: 'rebuilding'
}>

/**
 * The DevHost has stopped accepting work and its effects have been released.
 *
 * This terminal state makes repeated shutdown events harmless.
 */
export type StoppedState = Readonly<{
    /** Stable identity of the DevHost session that stopped. */
    buildId: string
    phase: 'stopped'
}>

/**
 * The minimal lifecycle state owned by the development protocol.
 *
 * This first model intentionally covers only session readiness and the single-client rebuild boundary. HMR patch
 * delivery is added later as a focused child state once its physical writer and acknowledgement transport exist.
 */
export type DevProtocolState = StartingState | AwaitingClientState | ActiveClientState | RebuildingState | StoppedState

/**
 * Input understood by the lifecycle reducer.
 *
 * Infrastructure adapters validate and parse host-specific details before emitting these values. The protocol therefore
 * reasons only about lifecycle facts, not HTTP objects, Vite types, filesystems, or RxJS subscriptions.
 */
export type DevProtocolEvent =
    | Readonly<{
          type: 'ready'
      }>
    | Readonly<{
          /** Identifies the runtime heap attempting to become or remain active. */
          clientId: string
          type: 'client-connected'
      }>
    | Readonly<{
          type: 'rebuild-finished'
      }>
    | Readonly<{
          type: 'stop'
      }>

/**
 * Declarative work requested by the lifecycle reducer.
 *
 * The later RxJS effect layer executes commands and feeds its completion back as a `DevProtocolEvent`; commands never
 * perform I/O themselves.
 */
export type DevProtocolCommand =
    | Readonly<{
          /** Identifies the heap for which the complete physical project must be regenerated. */
          clientId: string
          type: 'full-rebuild'
      }>
    | Readonly<{
          type: 'close-session'
      }>

/**
 * Result of one pure protocol transition.
 *
 * `state` is the complete next lifecycle state and `commands` is the exact work the effect layer must execute for this
 * event. An empty command list means the event was intentionally idempotent or irrelevant in the current state.
 */
export type DevProtocolTransition = Readonly<{
    /** The lifecycle state after handling one event. */
    state: DevProtocolState
    /** Ordered side-effect requests produced by the transition. */
    commands: readonly DevProtocolCommand[]
}>

/**
 * Creates a new protocol before initial physical output preparation has completed.
 *
 * The caller owns build-ID generation because that identity is shared by future HMR metadata and runtime messages.
 */
export function createInitialDevProtocolState(buildId: string): StartingState {
    return { buildId, phase: 'starting' }
}
