import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Subject } from 'rxjs'
import type { ViteDevServer } from 'vite'
import type { WxHostFact } from '../topology.ts'

/** Metadata-only control endpoint; executable code is always delivered by the physical patches.js file. */
export const hmrControlPath = '/__vpt_hmr__'

const maximumBodyBytes = 64 * 1024

type ControlRequest = Readonly<{
    action?: unknown
    buildId?: unknown
    clientId?: unknown
    modules?: unknown
    reason?: unknown
    token?: unknown
    version?: unknown
}>

/**
 * Converts App-runtime reports directly into host facts.
 *
 * Every request is independently complete. This edge retains no runtime version, session, pending response, or delivery
 * state; the topology combines a report with its private current Build.
 */
export function createControlEdge({
    facts$,
    registerModules,
    server
}: {
    facts$: Subject<WxHostFact>
    registerModules(clientId: string, modules: string[]): Promise<boolean>
    server: ViteDevServer
}): Readonly<{
    close(): void
    token: string
}> {
    const token = randomUUID()
    let closed = false

    server.middlewares.use(hmrControlPath, async (request, response) => {
        if (closed) {
            respond(response, 503, { type: 'closed' })
            return
        }
        if (request.method !== 'POST') {
            respond(response, 405, { type: 'method-not-allowed' })
            return
        }

        let body: ControlRequest
        try {
            body = JSON.parse(await readBody(request)) as ControlRequest
        } catch {
            respond(response, 400, { type: 'invalid-request' })
            return
        }
        if (body.token !== token || !isRuntimeIdentity(body)) {
            respond(response, 403, { type: 'forbidden' })
            return
        }

        if (body.action === 'modules' && isModuleRegistration(body)) {
            try {
                respond(response, (await registerModules(body.clientId, body.modules)) ? 204 : 409)
            } catch {
                respond(response, 500, { type: 'registration-failed' })
            }
            return
        }
        if (body.action === 'version' && typeof body.version === 'number' && Number.isSafeInteger(body.version)) {
            facts$.next({
                type: 'runtime-requested',
                buildId: body.buildId,
                clientId: body.clientId,
                version: body.version
            })
            respond(response, 204)
            return
        }
        if (body.action === 'failure' && typeof body.version === 'number' && Number.isSafeInteger(body.version)) {
            facts$.next({
                type: 'runtime-failed',
                buildId: body.buildId,
                clientId: body.clientId,
                reason: typeof body.reason === 'string' ? body.reason : 'Unknown runtime failure.',
                version: body.version
            })
            respond(response, 202)
            return
        }
        respond(response, 400, { type: 'invalid-request' })
    })

    return {
        close(): void {
            closed = true
        },
        token
    }
}

function isRuntimeIdentity(value: ControlRequest): value is ControlRequest & { buildId: string; clientId: string } {
    return typeof value.buildId === 'string' && typeof value.clientId === 'string'
}

function isModuleRegistration(
    value: ControlRequest & { buildId: string; clientId: string }
): value is ControlRequest & { buildId: string; clientId: string; modules: string[] } {
    return Array.isArray(value.modules) && value.modules.every((module) => typeof module === 'string')
}

async function readBody(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.length
        if (size > maximumBodyBytes) {
            throw new Error('WX HMR control request body is too large.')
        }
        chunks.push(buffer)
    }
    return Buffer.concat(chunks).toString('utf8')
}

function respond(response: ServerResponse, status: number, body?: unknown): void {
    if (response.writableEnded) {
        return
    }
    response.statusCode = status
    if (body === undefined) {
        response.end()
        return
    }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(body))
}
