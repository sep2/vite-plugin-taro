import type { BindingClientHmrUpdate } from 'rolldown/experimental'

/** Report endpoint path served by the shared WX development control edge. */
export const hmrControlPath = '/__vpt_hmr__'

/**
 * App metadata fixed for one complete build. The runtime echoes `buildId` in every report so delayed requests cannot mutate the
 * next journal, while `endpoint` is materialized only after Vite has bound its actual host and port.
 */
export type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
}>

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
