import type { RuntimePatch } from '../../mini-hmr-runtime.ts'

export const interpreterServerEvent = 'vpt:wx-interpreter:source'

/** One Rolldown patch whose existing code field is interpreted instead of wrapped in a native factory. */
export type InterpreterPatch = RuntimePatch & {
    readonly code: string
}

/** Messages published by the host over Vite's existing WebSocket. */
export type InterpreterServerMessage = Readonly<{
    kind: 'patches'
    buildId: string
    patches: readonly InterpreterPatch[]
}>
