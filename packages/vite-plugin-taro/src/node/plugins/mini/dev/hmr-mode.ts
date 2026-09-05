import type { Plugin } from 'vite'
import type { MiniHmrOptions, RuntimeModulesContract } from '../mini-contract.ts'
import type { PatchPublication } from './hmr-protocol.ts'
import { createDevtoolsHmrMode } from './modes/devtools/devtools-hmr-mode.ts'
import { createInterpreterHmrMode } from './modes/interpreter/interpreter-hmr-mode.ts'
import { createRebuildHmrMode } from './modes/rebuild/rebuild-hmr-mode.ts'

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
 * The behavior that differs between Mini Program development update implementations.
 *
 * Every mode selects one runtime, plugin set, entry banner, Rolldown rebuild policy, and declarative patch effects. Rebuild mode
 * uses `always` and returns no patch effects.
 */
export type MiniHmrMode = Readonly<{
    rebuildStrategy: 'always' | 'on-failure'
    runtimeFile: string
    plugins: readonly Plugin[]
    reset?: () => MiniHmrAction
    publish?: (publication: PatchPublication) => MiniHmrAction
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
        case 'rebuild':
            return createRebuildHmrMode(modules)
    }
}
