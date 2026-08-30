import type { RuntimePatch } from '../../wx-hmr-runtime.ts'

export const interpreterClientEvent = 'vpt:wx-interpreter:subscribe'
export const interpreterServerEvent = 'vpt:wx-interpreter:source'

/** One Rolldown patch whose existing code field is interpreted instead of wrapped in a native factory. */
export type InterpreterPatch = RuntimePatch & {
    readonly code: string
}

/** Identifies the App heap when its socket first asks for the journal's current suffix. */
export type InterpreterSubscription = Readonly<{
    buildId: string
}>

/** Messages published by the host over Vite's existing WebSocket. */
export type InterpreterServerMessage = Readonly<{
    kind: 'patches'
    buildId: string
    patches: readonly InterpreterPatch[]
}>
