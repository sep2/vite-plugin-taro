import type { Plugin } from 'vite'
import type { PatchPublication } from './hmr-protocol.ts'

/**
 * Durability boundary between the shared patch journal and one concrete delivery mechanism.
 *
 * `reset()` establishes an empty frontier before a new build identity becomes App-visible. `publish()` must resolve only after
 * the cumulative suffix is observable by that mode; the host advances Rolldown's published frontier only after this Promise, so
 * resolving earlier could let Rolldown generate a delta relative to code the runtime cannot yet load.
 */
export type WxHmrDelivery = Readonly<{
    reset: () => Promise<void>
    publish: (publication: PatchPublication) => Promise<void>
}>

/**
 * The behavior that genuinely differs between WX HMR implementations.
 *
 * A descriptor is created once while development plugins are composed and then closed over by the host and Rolldown options.
 * This keeps mode choice out of the per-update path. The host supplies the physical writer because it alone knows Vite's outDir;
 * the mode supplies runtime, entry edges, plugins, and delivery because those choices must remain internally consistent.
 */
export type WxHmrMode = Readonly<{
    runtimeFile: string
    plugins: readonly Plugin[]
    createDelivery: (writeFile: (fileName: string, source: string) => Promise<void>) => WxHmrDelivery
    createEntryBanner: (
        pageFiles: ReadonlySet<string>
    ) => (chunk: Readonly<{ name: string; fileName: string }>) => string
}>
