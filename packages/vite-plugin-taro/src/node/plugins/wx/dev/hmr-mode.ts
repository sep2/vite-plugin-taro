import type { Plugin, ViteDevServer } from 'vite'
import type { VptHmrOptions } from '../../../../options.ts'
import type { PatchPublication } from './hmr-protocol.ts'
import { createDevtoolsHmrMode } from './modes/devtools/devtools-hmr-mode.ts'
import { createInterpreterHmrMode } from './modes/interpreter/interpreter-hmr-mode.ts'
import type { PatchJournal } from './patch-journal.ts'

export type WriteDevelopmentFile = (fileName: string, source: string) => Promise<void>

/**
 * The behavior that genuinely differs between WX HMR implementations.
 *
 * The descriptor is selected once during plugin composition. Interpreter mode publishes the journal through Vite's existing
 * WebSocket; DevTools reset and publish effects materialize that same journal as its watched native patch file.
 */
export type WxHmrMode = Readonly<{
    runtimeFile: string
    plugins: readonly Plugin[]
    reset: (server: ViteDevServer, buildId: string, writeFile: WriteDevelopmentFile) => Promise<void>
    publish: (server: ViteDevServer, publication: PatchPublication, writeFile: WriteDevelopmentFile) => Promise<void>
    close: (server: ViteDevServer) => Promise<void>
    configureServer: (server: ViteDevServer, journal: PatchJournal) => void
    usesWebSocket: boolean
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
