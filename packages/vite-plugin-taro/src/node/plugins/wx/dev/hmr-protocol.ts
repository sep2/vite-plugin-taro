import type { BindingClientHmrUpdate } from 'rolldown/experimental'

/** Shared HTTP control path for runtime application and rebuild reports. */
export const hmrControlPath = '/__vpt_hmr__'

/**
 * App metadata fixed for one complete build. The runtime includes `buildId` in reports and socket subscriptions so delayed
 * traffic cannot mutate or consume the next journal. Endpoints are materialized only after Vite binds its actual host and port.
 */
export type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
    socketEndpoint?: string
}>

/** A runtime receipt committed through the host action queue before its HTTP request completes. */
export type RuntimeReport =
    | Readonly<{ kind: 'applied'; buildId: string; seq: number }>
    | Readonly<{ kind: 'rebuild'; buildId: string; reason: string }>

/** The Patch variant of Rolldown's per-client HMR update admitted into the patch journal. */
export type PatchUpdate = Extract<BindingClientHmrUpdate['update'], { type: 'Patch' }>

/**
 * One cumulative patch suffix coupled to its build identity. Delivery receives this structured value instead of reading journal
 * state, keeping physical rendering stateless and making stale-build rejection part of the payload the runtime actually sees.
 */
export type PatchPublication = Readonly<{
    buildId: string
    patches: readonly PatchUpdate[]
}>
