import type { ConnectMiniSocket, MiniSocketTask } from '../../mini/dev/mini-hmr-runtime.ts'

declare const xhs: {
    connectSocket(options: Readonly<{ url: string; protocols: readonly string[] }>): MiniSocketTask
}

/** Connects XHS's task-scoped socket to the shared HMR message and send contract. */
export const connectXhsSocket: ConnectMiniSocket = (endpoint) =>
    xhs.connectSocket({ url: endpoint, protocols: ['vite-hmr'] })
