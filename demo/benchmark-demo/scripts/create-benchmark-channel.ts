import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

interface Job {
    readonly ready: PromiseWithResolvers<boolean>
    readonly result: PromiseWithResolvers<unknown>
}

/** Deliver commands and results independently of the simulator's rendering-dependent automator RPC. */
export async function createBenchmarkChannel() {
    // Only live requests are retained; each run removes its token, deadline, and abort subscription on completion.
    const jobs = new Map<string, Job>()

    async function receive(request: IncomingMessage, response: ServerResponse): Promise<void> {
        const job = request.url && jobs.get(request.url)
        if (!job || (request.method !== 'GET' && request.method !== 'POST')) {
            response.writeHead(404).end()
            return
        }
        try {
            if (request.method === 'GET') {
                // The SDK starts its workload only after the automator has acknowledged the launch command.
                const ready = await job.ready.promise
                response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' }).end('{}')
                return
            }
            request.setEncoding('utf8')
            // Accumulate this small SDK result body locally before decoding its JSON value.
            let body = ''
            for await (const chunk of request) {
                assert.equal(typeof chunk, 'string')
                body += chunk
            }
            const value: unknown = JSON.parse(body)
            job.result.resolve(value)
            response.writeHead(200, { 'content-type': 'application/json' }).end('{}')
        } catch (error) {
            job.result.reject(error)
            response.writeHead(400).end()
        }
    }

    const server = createServer((request, response) => {
        void receive(request, response)
    })
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const origin = `http://127.0.0.1:${address.port}`

    return {
        async run(launch: (url: string) => Promise<unknown>, signal: AbortSignal, timeout: number): Promise<unknown> {
            signal.throwIfAborted()
            const path = `/${randomUUID()}`
            const job: Job = { ready: Promise.withResolvers<boolean>(), result: Promise.withResolvers<unknown>() }
            jobs.set(path, job)
            const abort = () => job.result.reject(signal.reason)
            const deadline = setTimeout(
                () => job.result.reject(new Error('Benchmark result callback timed out')),
                timeout
            )
            signal.addEventListener('abort', abort, { once: true })
            try {
                const launched = launch(`${origin}${path}`).then(
                    () => {
                        job.ready.resolve(true)
                    },
                    (error: unknown) => {
                        job.ready.resolve(false)
                        throw error
                    }
                )
                const [, result] = await Promise.all([launched, job.result.promise])
                return result
            } finally {
                clearTimeout(deadline)
                signal.removeEventListener('abort', abort)
                job.ready.resolve(false)
                jobs.delete(path)
            }
        },
        async close(): Promise<void> {
            for (const job of jobs.values()) {
                job.ready.resolve(false)
                job.result.reject(new Error('Benchmark result channel closed'))
            }
            server.closeAllConnections()
            await new Promise<void>((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error)
                    } else {
                        resolve()
                    }
                })
            })
        }
    }
}
