import assert from 'node:assert/strict'
import { request } from 'node:http'
import test, { type TestContext } from 'node:test'
import { createServer } from 'vite'
import { createTestProject } from '../../tests/create-test-project.ts'
import { hmrEndpointPath } from '../mini/dev/hmr-protocol.ts'
import { createTbHmrPlugin } from './create-tb-hmr-plugin.ts'

async function createFixture(context: TestContext) {
    const root = await createTestProject('tb-socket-')
    const server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        server: { host: '127.0.0.1', ws: { path: hmrEndpointPath } },
        plugins: [createTbHmrPlugin()]
    })
    const httpServer = server.httpServer!
    const routeListener = httpServer.listeners('upgrade')[0]
    context.after(async () => {
        await server.close()
        assert.ok(!httpServer.listeners('upgrade').includes(routeListener!))
    })
    await server.listen(0)
    const address = httpServer.address()
    assert.ok(address && typeof address !== 'string')
    const endpoint = new URL(`ws://127.0.0.1:${address.port}${hmrEndpointPath}`)
    endpoint.searchParams.set('token', server.config.webSocketToken)
    return { server, httpServer, endpoint }
}

for (const protocols of [[], ['vite-hmr']]) {
    test(`exchanges Vite custom events with protocols ${JSON.stringify(protocols)}`, {
        timeout: 10_000
    }, async (context) => {
        const { server, endpoint } = await createFixture(context)
        server.ws.on('tb:probe', (data, client) => client.send('tb:reply', data))
        const socket = new WebSocket(endpoint, protocols)
        const reply = new Promise<unknown>((resolve) => {
            socket.addEventListener('message', ({ data }) => {
                const payload = JSON.parse(data)
                if (payload.type === 'custom') {
                    resolve(payload)
                }
            })
        })
        await new Promise<void>((resolve, reject) => {
            socket.addEventListener('open', () => resolve(), { once: true })
            socket.addEventListener('error', () => reject(new Error('WebSocket handshake failed')), { once: true })
        })
        assert.equal(socket.protocol, protocols[0] ?? '')
        socket.send(JSON.stringify({ type: 'custom', event: 'tb:probe', data: { seq: 1 } }))
        assert.deepEqual(await reply, { type: 'custom', event: 'tb:reply', data: { seq: 1 } })
    })
}

for (const rejected of ['path', 'missing-token', 'wrong-token', 'other-protocol'] as const) {
    test(`leaves ${rejected} requests outside the protocol-free route`, { timeout: 10_000 }, async (context) => {
        const { server, httpServer, endpoint } = await createFixture(context)
        if (rejected === 'path') {
            endpoint.pathname = '/another-socket'
        } else if (rejected === 'missing-token') {
            endpoint.searchParams.delete('token')
        } else if (rejected === 'wrong-token') {
            endpoint.searchParams.set('token', 'wrong-token')
        }
        const protocols = rejected === 'other-protocol' ? ['other'] : []
        const upgrade = new Promise<unknown>((resolve) => {
            httpServer.once('upgrade', (request) => resolve(request.headers['sec-websocket-protocol']))
        })
        const socket = new WebSocket(endpoint, protocols)
        assert.equal(await upgrade, protocols[0])
        assert.equal(server.ws.clients.size, 0)
        await new Promise<void>((resolve) => {
            socket.addEventListener('close', () => resolve(), { once: true })
            socket.close()
        })
    })
}

test('preserves Vite host validation for an authenticated protocol-free request', {
    timeout: 10_000
}, async (context) => {
    const { server, endpoint } = await createFixture(context)
    endpoint.protocol = 'http:'
    const status = await new Promise<number | undefined>((resolve, reject) => {
        const handshake = request(endpoint, {
            headers: {
                Host: 'untrusted.example',
                Origin: 'file://',
                Connection: 'Upgrade',
                Upgrade: 'websocket',
                'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
                'Sec-WebSocket-Version': '13'
            }
        })
        handshake.once('response', (response) => {
            response.resume()
            resolve(response.statusCode)
        })
        handshake.once('upgrade', (_, socket) => {
            socket.destroy()
            reject(new Error('Vite accepted an untrusted Host'))
        })
        handshake.once('error', reject)
        handshake.end()
    })
    assert.equal(status, 400)
    assert.equal(server.ws.clients.size, 0)
})
