/** Host-to-App terminal control over the App heap's authenticated Vite socket. */
export const runtimeControlEvent = 'vpt:wx-hmr:control'
/** App-to-host application frontier and rebuild reports over the same socket. */
export const runtimeReportEvent = 'vpt:wx-hmr:report'

/** Build identity and authenticated socket endpoint fixed for one App heap. */
export type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
}>

export type RuntimeReport =
    | Readonly<{ kind: 'applied'; buildId: string; seq: number }>
    | Readonly<{ kind: 'rebuild'; buildId: string; reason: string }>

export type RuntimeControlMessage = Readonly<{
    kind: 'close'
    reason: 'build replaced' | 'host closed'
}>
