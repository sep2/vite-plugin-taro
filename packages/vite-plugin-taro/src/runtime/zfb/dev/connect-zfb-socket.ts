import type { ConnectMiniSocket, MiniSocketTask } from '../../mini/dev/mini-hmr-runtime.ts'

type ZfbSocketTask = Omit<MiniSocketTask, 'onMessage'> &
    Readonly<{
        onMessage(listener: (result: Readonly<{ message: string }>) => void): void
    }>

declare const my: {
    connectSocket(options: Readonly<{ url: string; multiple: true; protocols: readonly string[] }>): ZfbSocketTask
}

/**
 * Opens an independent Alipay socket and adapts its receive envelope to the shared Mini runtime.
 *
 * Alipay reports inbound text as `{ message }`, whereas WeChat and the internal socket contract use `{ data }`. Without this
 * adapter the WebSocket frame remains visible in DevTools, but the shared listener reads `undefined`, classifies it as non-text,
 * and returns without evaluating the interpreter patch or logging an error. Vite sends only JSON text, so no binary conversion is
 * needed here.
 */
export const connectZfbSocket: ConnectMiniSocket = (endpoint) => {
    const socket = my.connectSocket({ url: endpoint, multiple: true, protocols: ['vite-hmr'] })

    return {
        send: (options) => socket.send(options),
        close: (options) => socket.close(options),
        onMessage: (listener) => {
            socket.onMessage(({ message }) => listener({ data: message }))
        }
    }
}
