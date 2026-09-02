import type { ConnectMiniSocket, MiniSocketTask } from '../../mini/dev/mini-hmr-runtime.ts'

declare const my: {
    connectSocket(options: Readonly<{ url: string; multiple: true }>): MiniSocketTask
}

/** Opens an independent task-scoped Vite socket through the Alipay native API. */
export const connectZfbSocket: ConnectMiniSocket = (endpoint) => my.connectSocket({ url: endpoint, multiple: true })
