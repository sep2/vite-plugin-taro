import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { filter, firstValueFrom, map, merge, type Observable, Subject, take, timer } from 'rxjs'
import type { ViteDevServer } from 'vite'
import type { HmrCommand, UpdatePoll, UpdateWriteResult } from './topology/types.ts'

export const hmrControlPath = '/__vpt_hmr__'
const pollTimeout = 25_000
const maximumBodyBytes = 64 * 1024

export type BuildAvailability =
    | Readonly<{ buildId: string; kind: 'building' }>
    | Readonly<{ buildId: string; kind: 'active' }>
    | Readonly<{ buildId: string; kind: 'failed' }>

type ControlRequest = Readonly<{
    action?: unknown
    appliedVersion?: unknown
    buildId?: unknown
    clientId?: unknown
    modules?: unknown
    token?: unknown
}>

type PollOutcome =
    | Readonly<{ kind: 'idle' }>
    | Readonly<{ kind: 'rebuilding' }>
    | Readonly<{ kind: 'closed' }>
    | Readonly<{ kind: 'write-result'; result: UpdateWriteResult }>

/**
 * Adapts metadata-only WX requests to topology facts and request-scoped responses.
 *
 * Every long poll owns its own filtered observable lifetime. There is no response map: a correlated update-write result,
 * build boundary, timeout, or close fact completes that request directly.
 */
export function createControlChannel({
    buildAvailability$,
    commands$,
    polls$,
    registerModules,
    requestRebuild,
    server,
    updateWriteResults$
}: {
    /** Replayed physical-build availability maintained by the command edge. */
    buildAvailability$: Observable<BuildAvailability>
    /** Shared topology command stream. */
    commands$: Observable<HmrCommand>
    /** Runtime poll fact sink. */
    polls$: Subject<UpdatePoll>
    /** Rolldown module-registration edge. */
    registerModules(clientId: string, modules: string[]): Promise<boolean>
    /** Converts runtime execution failure into a fresh edge-owned build request. */
    requestRebuild(): void
    server: ViteDevServer
    /** Update writer facts correlated by HTTP request identity. */
    updateWriteResults$: Observable<UpdateWriteResult>
}): Readonly<{
    close(): void
    token: string
}> {
    const token = randomUUID()
    const closed$ = new Subject<void>()
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
        if (body.token !== token || !isClientIdentity(body)) {
            respond(response, 403, { type: 'forbidden' })
            return
        }

        if (body.action === 'rebuild') {
            requestRebuild()
            respond(response, 202, { type: 'rebuilding' })
            return
        }

        const availability = await firstValueFrom(buildAvailability$.pipe(take(1)))
        if (availability.kind !== 'active' || availability.buildId !== body.buildId) {
            respond(response, 202, { type: 'rebuilding' })
            return
        }

        if (body.action === 'modules') {
            if (!isModuleRegistration(body)) {
                respond(response, 400, { type: 'invalid-request' })
                return
            }
            try {
                if (!(await registerModules(body.clientId, body.modules))) {
                    respond(response, 409, { type: 'rebuilding' })
                    return
                }
                respond(response, 204)
            } catch {
                respond(response, 500, { type: 'registration-failed' })
            }
            return
        }

        if (
            body.action !== 'poll' ||
            typeof body.appliedVersion !== 'number' ||
            !Number.isFinite(body.appliedVersion)
        ) {
            respond(response, 400, { type: 'invalid-request' })
            return
        }

        const requestId = randomUUID()
        const outcome = firstValueFrom(
            merge(
                updateWriteResults$.pipe(
                    filter((result) => result.requestId === requestId),
                    map((result): PollOutcome => ({ kind: 'write-result', result }))
                ),
                buildAvailability$.pipe(
                    filter((state) => state.kind !== 'active' || state.buildId !== body.buildId),
                    map((): PollOutcome => ({ kind: 'rebuilding' }))
                ),
                commands$.pipe(
                    filter((command) => command.kind === 'request-rebuild' && command.buildId === body.buildId),
                    map((): PollOutcome => ({ kind: 'rebuilding' }))
                ),
                closed$.pipe(map((): PollOutcome => ({ kind: 'closed' }))),
                timer(pollTimeout).pipe(map((): PollOutcome => ({ kind: 'idle' })))
            ).pipe(take(1))
        )

        polls$.next({
            appliedVersion: body.appliedVersion,
            buildId: body.buildId,
            clientId: body.clientId,
            requestId
        })

        const result = await outcome
        switch (result.kind) {
            case 'write-result':
                respond(response, result.result.ok ? 200 : 500, {
                    type: result.result.ok ? 'update-published' : 'update-write-failed'
                })
                return
            case 'idle':
                respond(response, 200, { type: 'idle' })
                return
            case 'rebuilding':
                respond(response, 202, { type: 'rebuilding' })
                return
            case 'closed':
                respond(response, 503, { type: 'closed' })
        }
    })

    return {
        close(): void {
            closed = true
            closed$.next()
            closed$.complete()
        },
        token
    }
}

function isClientIdentity(value: ControlRequest): value is ControlRequest & { buildId: string; clientId: string } {
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
            throw new Error('WX HMR request body is too large.')
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
