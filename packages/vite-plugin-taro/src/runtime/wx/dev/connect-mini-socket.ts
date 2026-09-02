import type { ConnectMiniSocket } from '../../mini/dev/mini-hmr-runtime.ts'

/** Opens the task-scoped Vite socket through the WeChat native API. */
export const connectMiniSocket: ConnectMiniSocket = (endpoint) =>
    wx.connectSocket({ url: endpoint, protocols: ['vite-hmr'] })
