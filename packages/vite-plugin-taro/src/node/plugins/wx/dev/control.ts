import type { ServerResponse } from 'node:http'
import type { Connect, ViteDevServer } from 'vite'
import { hmrControlPath } from './hmr-files.ts'

/** One metadata-only runtime report; executable code never travels over HTTP. */
type RuntimeReport = Readonly<{
    buildId: string
    version: number
    modules?: readonly string[]
}>

const maximumBodyBytes = 64 * 1024

/** Receives the runtime's metadata-only reports on the shared control path. */
export function createControlChannel(server: ViteDevServer): void {
    server.middlewares.use(hmrControlPath, (req, res) => void handleReport(server, req, res))
}

async function handleReport(server: ViteDevServer, req: Connect.IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
        res.statusCode = 404
        res.end()
        return
    }

    try {
        const report = JSON.parse(await readBody(req)) as RuntimeReport
        server.config.logger.info(
            `[vite-plugin-taro] wx runtime report build ${report.buildId} version ${report.version}`
        )
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ type: 'ok' }))
    } catch {
        res.statusCode = 400
        res.end()
    }
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = ''
        req.on('data', (chunk: Buffer) => {
            body += chunk.toString('utf8')
            if (body.length > maximumBodyBytes) {
                reject(new Error('report body too large'))
                req.destroy()
            }
        })
        req.on('end', () => resolve(body))
        req.on('error', reject)
    })
}
