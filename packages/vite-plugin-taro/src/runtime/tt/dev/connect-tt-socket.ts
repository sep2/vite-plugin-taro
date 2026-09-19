import type { ConnectMiniSocket, MiniSocketTask } from '../../mini/dev/mini-hmr-runtime.ts'

declare const tt: {
    connectSocket(options: Readonly<{ url: string; protocols: readonly string[] }>): MiniSocketTask
}

/** TT's task-scoped socket uses the shared { data } message/send contract. */
export const connectTtSocket: ConnectMiniSocket = (endpoint) =>
    tt.connectSocket({ url: endpoint, protocols: ['vite-hmr'] })
