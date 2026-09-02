import type { ConnectMiniSocket, MiniSocketTask } from '../../mini/dev/mini-hmr-runtime.ts'

declare const wx: {
    connectSocket(options: Readonly<{ url: string; protocols: readonly string[] }>): MiniSocketTask
}

/** Opens the task-scoped Vite socket through the WeChat native API. */
export const connectWxSocket: ConnectMiniSocket = (endpoint) =>
    wx.connectSocket({ url: endpoint, protocols: ['vite-hmr'] })
