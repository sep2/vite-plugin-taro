import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'
import { hmrEndpointPath } from '../mini/dev/hmr-protocol.ts'

/**
 * Routes authenticated Taobao IDE sockets through Vite's existing HMR channel.
 * The IDE omits WebSocket subprotocols; Vite's shared HTTP listener routes only `vite-hmr` requests.
 * Select that route internally, then keep the wire response protocol-free as the client requested.
 */
export function createTbHmrPlugin(): Plugin {
    return {
        name: 'vpt:tb-hmr',
        apply: 'serve',
        configureServer(server) {
            // Mini development owns an HTTP server; its lifetime also owns these two handshake listeners.
            const httpServer = server.httpServer!
            // Track only requests admitted here, so ordinary Vite clients retain their negotiated subprotocol.
            const admitted = new WeakSet<IncomingMessage>()
            const routeRequest = (request: IncomingMessage): void => {
                if (request.headers['sec-websocket-protocol'] !== undefined) {
                    return
                }
                // Node's HTTP upgrade event always carries a request URL.
                const endpoint = new URL(request.url!, 'http://localhost')
                if (
                    endpoint.pathname !== hmrEndpointPath ||
                    endpoint.searchParams.get('token') !== server.config.webSocketToken
                ) {
                    return
                }
                admitted.add(request)
                request.headers['sec-websocket-protocol'] = 'vite-hmr'
            }
            const completeHandshake = (headers: string[], request: IncomingMessage): void => {
                if (!admitted.delete(request)) {
                    return
                }
                // Vite's ws server has selected this route and inserted exactly this response header.
                delete request.headers['sec-websocket-protocol']
                headers.splice(headers.indexOf('Sec-WebSocket-Protocol: vite-hmr'), 1)
            }
            httpServer.prependListener('upgrade', routeRequest)
            server.ws.on('headers', completeHandshake)
            httpServer.once('close', () => {
                httpServer.removeListener('upgrade', routeRequest)
                server.ws.off('headers', completeHandshake)
            })
        }
    }
}
