import type { ConnectMiniSocket, MiniSocketTask } from '../../mini/dev/mini-hmr-runtime.ts'

declare const my: {
    connectSocket(options: Readonly<{ url: string; multiple: true; protocols: readonly string[] }>): MiniSocketTask
}

/** Opens an independent task-scoped Vite socket and negotiates the protocol required by Vite's HMR server. */
export const connectZfbSocket: ConnectMiniSocket = (endpoint) =>
    my.connectSocket({ url: endpoint, multiple: true, protocols: ['vite-hmr'] })
