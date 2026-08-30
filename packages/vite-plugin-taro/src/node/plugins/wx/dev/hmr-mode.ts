import type { Plugin } from 'vite'
import type { VptHmrOptions } from '../../../../options.ts'
import type { PatchPublication } from './hmr-protocol.ts'
import { createDevtoolsHmrMode } from './modes/devtools/devtools-hmr-mode.ts'
import { createInterpreterHmrMode } from './modes/interpreter/interpreter-hmr-mode.ts'

/** One mode-selected effect executed by the development host. */
export type WxHmrAction =
    | Readonly<{
          kind: 'event'
          event: string
          data: unknown
      }>
    | Readonly<{
          kind: 'write'
          fileName: string
          source: string
      }>

/**
 * The behavior that genuinely differs between WX HMR implementations.
 *
 * The descriptor is selected once during plugin composition and returns declarative effects. The shared host alone performs
 * physical writes and event transport, so neither mode receives a Vite server or owns asynchronous infrastructure.
 */
export type WxHmrMode = Readonly<{
    runtimeFile: string
    plugins: readonly Plugin[]

    reset: () => WxHmrAction | undefined
    publish: (publication: PatchPublication) => WxHmrAction
    replay: (publication: PatchPublication | undefined, buildId: string) => WxHmrAction | undefined

    createEntryBanner: (
        pageFiles: ReadonlySet<string>
    ) => (chunk: Readonly<{ name: string; fileName: string }>) => string
}>

/** Resolves exactly one implementation before the WX development host is created. */
export function createWxHmrMode(options: VptHmrOptions | undefined): WxHmrMode {
    const mode = options?.mode ?? 'devtools'
    switch (mode) {
        case 'devtools':
            return createDevtoolsHmrMode()
        case 'interpreter':
            return createInterpreterHmrMode()
    }
}
