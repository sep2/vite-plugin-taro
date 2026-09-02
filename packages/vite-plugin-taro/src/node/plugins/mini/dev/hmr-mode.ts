import type { Plugin } from 'vite'
import type { MiniHmrOptions, RuntimeModulesContract } from '../mini-contract.ts'
import type { PatchPublication } from './hmr-protocol.ts'
import { createDevtoolsHmrMode } from './modes/devtools/devtools-hmr-mode.ts'
import { createInterpreterHmrMode } from './modes/interpreter/interpreter-hmr-mode.ts'

/** One mode-selected effect executed by the development host. */
export type MiniHmrAction =
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
 * The behavior that genuinely differs between Mini Program HMR implementations.
 *
 * The descriptor is selected once during plugin composition and returns declarative effects. The shared host alone performs
 * physical writes and event transport, so neither mode receives a Vite server or owns asynchronous infrastructure.
 */
export type MiniHmrMode = Readonly<{
    runtimeFile: string
    plugins: readonly Plugin[]

    reset: () => MiniHmrAction | undefined
    publish: (publication: PatchPublication) => MiniHmrAction

    createEntryBanner: (
        pageFiles: ReadonlySet<string>
    ) => (chunk: Readonly<{ name: string; fileName: string }>) => string
}>

/** Resolves exactly one implementation before the Mini Program development host is created. */
export function createMiniHmrMode(options: MiniHmrOptions, modules: RuntimeModulesContract): MiniHmrMode {
    const mode = options?.mode ?? 'devtools'
    switch (mode) {
        case 'devtools':
            return createDevtoolsHmrMode(modules)
        case 'interpreter':
            return createInterpreterHmrMode(modules)
    }
}
