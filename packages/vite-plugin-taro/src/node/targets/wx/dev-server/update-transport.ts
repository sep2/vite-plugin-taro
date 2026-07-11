/**
 * Adapts the pure server protocol to Vite HTTP middleware and literal update-file publication.
 * HTTP messages contain metadata only; executable JavaScript reaches DevTools through the injected file writer.
 */
import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import {
    createWxUpdateServerState,
    transitionWxUpdateServer,
    type WxUpdateBatch,
    type WxUpdateServerCommand
} from './update-server-state.ts'

const endpointPath = '/__vite_plugin_taro_wx_update__'
// Keep the host response below update-client.ts's 30-second wx.request timeout.
const pollTimeout = 25_000

type PendingPoll = {
    response: ServerResponse
    timeout: NodeJS.Timeout
}

type UpdateRequest = {
    token?: unknown
    action?: unknown
    buildId?: unknown
    sessionId?: unknown
    version?: unknown
}

export class WxUpdateTransport {
    private state = createWxUpdateServerState(createId())
    private readonly token = createId()
    private readonly pendingPolls = new Map<string, PendingPoll>()
    private closed = false

    constructor(
        private readonly server: ViteDevServer,
        private readonly requestFullBuild: () => void,
        private readonly writeUpdateFile: (buildId: string, source: string) => Promise<void>
    ) {}

    get retainedDeltaCount(): number {
        return this.state.hostVersion
    }

    get retainedDeltaBytes(): number {
        return this.state.retainedDeltaBytes
    }

    install(): void {
        this.server.middlewares.use(endpointPath, this.handleRequest)
    }

    close(): void {
        this.closed = true
        this.respondToAll({ type: 'rebuilding' })
    }

    addDelta(code: string): void {
        this.apply({ type: 'delta-added', code, bytes: Buffer.byteLength(code) })
        this.respondToAll({ type: 'changed' })
    }

    createBuildId(): string {
        return createId()
    }

    isCurrentBuild(buildId: string): boolean {
        return this.state.buildId === buildId
    }

    commitFullBuild(buildId: string): void {
        this.apply({ type: 'full-build-committed', buildId })
        this.respondToAll({ type: 'rebuilding' })
    }

    /** Generates late-bound App metadata after Vite has selected its actual listening port. */
    createControlSource(buildId = this.state.buildId): string {
        const address = this.server.httpServer?.address()
        const port = address && typeof address !== 'string' ? address.port : this.server.config.server.port
        return `globalThis.__VITE_PLUGIN_TARO_WX_CONTROL__ = ${JSON.stringify({
            url: `http://localhost:${port}${endpointPath}`,
            token: this.token,
            buildId
        })};\n`
    }

    private readonly handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        if (this.closed || request.method !== 'POST') {
            respond(response, 404, { type: 'not-found' })
            return
        }

        let body: UpdateRequest
        try {
            body = JSON.parse(await readBody(request)) as UpdateRequest
        } catch {
            respond(response, 400, { type: 'invalid-request' })
            return
        }
        if (body.token !== this.token || !isClientReport(body)) {
            respond(response, 403, { type: 'forbidden' })
            return
        }

        if (body.action === 'rebuild') {
            this.requestFullBuild()
            respond(response, 202, { type: 'rebuilding' })
            return
        }
        if (body.action === 'register') {
            const transition = this.apply({
                type: 'client-registered',
                buildId: body.buildId,
                sessionId: body.sessionId,
                version: body.version
            })
            if (transition.some((command) => command.type === 'request-full-build')) this.requestFullBuild()
            respond(response, 200, { type: 'registered' })
            return
        }
        if (body.action !== 'poll') {
            respond(response, 400, { type: 'invalid-request' })
            return
        }

        const commands = this.apply({
            type: 'client-reported',
            buildId: body.buildId,
            sessionId: body.sessionId,
            version: body.version
        })
        await this.executePollCommands(body.sessionId, commands, response)
    }

    private async executePollCommands(
        sessionId: string,
        commands: WxUpdateServerCommand[],
        response: ServerResponse
    ): Promise<void> {
        const publish = commands.find((command) => command.type === 'publish-batch')
        if (publish?.type === 'publish-batch') {
            try {
                await this.writeBatch(publish.batch)
                respond(response, 200, { type: 'batch-published', targetVersion: publish.batch.targetVersion })
            } catch {
                this.apply({
                    type: 'batch-publish-failed',
                    sessionId: publish.batch.sessionId,
                    targetVersion: publish.batch.targetVersion
                })
                respond(response, 500, { type: 'publish-failed' })
            }
            return
        }
        if (commands.some((command) => command.type === 'request-full-build')) {
            this.requestFullBuild()
            respond(response, 202, { type: 'rebuilding' })
            return
        }
        if (commands.some((command) => command.type === 'ignore-client')) {
            respond(response, 409, { type: 'rebuilding' })
            return
        }
        this.holdPoll(sessionId, response)
    }

    private holdPoll(sessionId: string, response: ServerResponse): void {
        const previous = this.pendingPolls.get(sessionId)
        if (previous) this.finishPoll(sessionId, previous, { type: 'changed' })

        let pending: PendingPoll
        pending = {
            response,
            timeout: setTimeout(() => this.finishPoll(sessionId, pending, { type: 'idle' }), pollTimeout)
        }
        this.pendingPolls.set(sessionId, pending)
        response.on('close', () => this.finishPoll(sessionId, pending))
    }

    private respondToAll(value: { type: string }): void {
        for (const [sessionId, pending] of this.pendingPolls) this.finishPoll(sessionId, pending, value)
    }

    private finishPoll(sessionId: string, pending: PendingPoll, value?: { type: string }): void {
        if (this.pendingPolls.get(sessionId) !== pending) return
        clearTimeout(pending.timeout)
        this.pendingPolls.delete(sessionId)
        if (value) respond(pending.response, 200, value)
    }

    private apply(event: Parameters<typeof transitionWxUpdateServer>[1]): WxUpdateServerCommand[] {
        const transition = transitionWxUpdateServer(this.state, event)
        this.state = transition.state
        return transition.commands
    }

    private async writeBatch(batch: WxUpdateBatch): Promise<void> {
        await this.writeUpdateFile(batch.buildId, renderBatch(batch, createId()))
    }
}

/** Renders executable code for update.js; this source is never included in an HTTP response. */
function renderBatch(batch: WxUpdateBatch, nonce: string): string {
    return `// ${nonce}\nglobalThis.__VITE_PLUGIN_TARO_WX_UPDATE_CLIENT__.receiveBatch(${JSON.stringify({
        buildId: batch.buildId,
        fromVersion: batch.fromVersion,
        targetVersion: batch.targetVersion
    })}, () => {
${indent(batch.deltas.map((delta) => delta.code).join('\n'), 4)}
});\n`
}

function indent(value: string, spaces: number): string {
    const prefix = ' '.repeat(spaces)
    return value
        .split('\n')
        .map((line) => `${prefix}${line}`)
        .join('\n')
}

function isClientReport(value: UpdateRequest): value is {
    token: string
    action: 'register' | 'poll' | 'rebuild'
    buildId: string
    sessionId: string
    version: number
} {
    return (
        typeof value.token === 'string' &&
        typeof value.action === 'string' &&
        typeof value.buildId === 'string' &&
        typeof value.sessionId === 'string' &&
        typeof value.version === 'number'
    )
}

async function readBody(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.length
        if (size > 64 * 1024) throw new Error('WX update request body is too large.')
        chunks.push(buffer)
    }
    return Buffer.concat(chunks).toString('utf8')
}

function respond(response: ServerResponse, status: number, body: unknown): void {
    if (response.writableEnded) return
    response.statusCode = status
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(body))
}

function createId(): string {
    return randomBytes(16).toString('hex')
}
