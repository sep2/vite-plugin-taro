import type { ConnectMiniSocket, MiniSocketTask } from '../../mini/dev/mini-hmr-runtime.ts'

type SocketListeners = {
    open: () => void
    close: (details?: unknown) => void
    error: (details?: unknown) => void
    message: (event: Readonly<{ data: unknown }>) => void
}

declare const my: {
    connectSocket(
        options: Readonly<{
            url: string
            header: Readonly<Record<string, string>>
            fail: SocketListeners['error']
        }>
    ): void
    sendSocketMessage(options: Readonly<{ data: string }>): void
    closeSocket(): void
    onSocketOpen(listener: SocketListeners['open']): void
    offSocketOpen(listener: SocketListeners['open']): void
    onSocketClose(listener: SocketListeners['close']): void
    offSocketClose(listener: SocketListeners['close']): void
    onSocketError(listener: SocketListeners['error']): void
    offSocketError(listener: SocketListeners['error']): void
    onSocketMessage(listener: SocketListeners['message']): void
    offSocketMessage(listener: SocketListeners['message']): void
}

/**
 * Adapts Taobao's App-global socket to VPT's task-scoped transport.
 * Taobao receives text as { data }; native hosts negotiate the Vite subprotocol through the request header.
 * The IDE omits that header, so the development host also accepts authenticated protocol-free handshakes.
 * Each connection owns its native callbacks and removes exactly those callbacks on terminal events.
 */
export const connectTbSocket: ConnectMiniSocket = (endpoint): MiniSocketTask => {
    // VPT registers its four listeners after connecting; only these local callbacks change during setup.
    const listeners: SocketListeners = {
        open: () => {},
        close: () => {},
        error: () => {},
        message: () => {}
    }
    const onOpen = () => listeners.open()
    const onMessage: SocketListeners['message'] = (event) => listeners.message(event)
    const onClose: SocketListeners['close'] = (details) => {
        detach()
        listeners.close(details)
    }
    const onError: SocketListeners['error'] = (details) => {
        detach()
        listeners.error(details)
    }

    function detach(): void {
        my.offSocketOpen(onOpen)
        my.offSocketClose(onClose)
        my.offSocketError(onError)
        my.offSocketMessage(onMessage)
    }

    my.onSocketOpen(onOpen)
    my.onSocketClose(onClose)
    my.onSocketError(onError)
    my.onSocketMessage(onMessage)
    my.connectSocket({ url: endpoint, header: { 'Sec-WebSocket-Protocol': 'vite-hmr' }, fail: onError })

    return {
        send: (options) => my.sendSocketMessage(options),
        close: () => {
            detach()
            my.closeSocket()
        },
        onOpen: (listener) => {
            listeners.open = listener
        },
        onClose: (listener) => {
            listeners.close = listener
        },
        onError: (listener) => {
            listeners.error = listener
        },
        onMessage: (listener) => {
            listeners.message = listener
        }
    }
}
