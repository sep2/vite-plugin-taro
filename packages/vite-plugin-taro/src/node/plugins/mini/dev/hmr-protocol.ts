import type { BindingClientHmrUpdate } from 'rolldown/experimental'

/** Shared Vite WebSocket path for runtime reports and mode-specific HMR events. */
export const hmrEndpointPath = '/__vpt_hmr__'

export type { HmrInfo, RuntimeReport } from '../../../../runtime/mini/dev/hmr-protocol.ts'

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
