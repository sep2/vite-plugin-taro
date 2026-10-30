import assert from 'node:assert/strict'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'vite'
import { type HmrInfo, runtimeReportEvent } from '../../../runtime/mini/dev/hmr-protocol.ts'
import {
    type InterpreterServerMessage,
    interpreterServerEvent
} from '../../../runtime/mini/dev/modes/interpreter/interpreter-protocol.ts'
import { createTestProject } from '../../tests/create-test-project.ts'
import vpt from '../../vpt.ts'

test('builds and exchanges Taobao interpreter patches without a WebSocket subprotocol', {
    timeout: 30_000
}, async () => {
    const root = await createTestProject('tb-dev-')
    await mkdir(path.join(root, 'src/pages'), { recursive: true })
    await writeFile(path.join(root, 'app.tsx'), 'export default function App({ children }) { return children }')
    await writeFile(
        path.join(root, 'src/pages/home.tsx'),
        'export default function Home() { return <view>Taobao</view> }'
    )
    const server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        build: { outDir: path.join(root, 'dist') },
        server: { host: '127.0.0.1' },
        plugins: vpt({
            target: 'tb',
            app: 'app.tsx',
            pages: [{ path: 'pages/home', config: { defaultTitle: 'Home' } }],
            appJson: { window: { defaultTitle: 'Taobao' }, subPackageBuildType: 'shared' },
            projectConfigJson: { appid: 'fixture', component2: true },
            hmr: { mode: 'interpreter' }
        })
    })
    try {
        await server.listen()
        const output = path.join(root, 'dist')
        const app = JSON.parse(await readFile(path.join(output, 'app.json'), 'utf8'))
        assert.deepEqual(app, {
            window: { defaultTitle: 'Taobao' },
            pages: ['pages/home'],
            subPackageBuildType: 'shared'
        })
        assert.deepEqual(JSON.parse(await readFile(path.join(output, 'mini.project.json'), 'utf8')), {
            appid: 'fixture',
            component2: true
        })
        assert.match(await readFile(path.join(output, 'pages/home.axml'), 'utf8'), /<comp /)
        assert.match(await readFile(path.join(output, 'common/rolldown-runtime.js'), 'utf8'), /Sec-WebSocket-Protocol/)

        const infoPath = path.join(output, 'hmr/info.js')
        // The serialized listening action publishes metadata atomically after the initial output.
        await waitForFile(infoPath, 100)
        const infoSource = await readFile(infoPath, 'utf8')
        const info: HmrInfo = JSON.parse(infoSource.match(/\{.*\}/)![0])
        // Taobao IDE calls new WebSocket(url), ignoring the native API's header option.
        const socket = new WebSocket(info.endpoint)
        await once(socket, 'open', { signal: AbortSignal.timeout(5_000) })
        assert.equal(socket.protocol, '')
        socket.send(
            JSON.stringify({
                type: 'custom',
                event: runtimeReportEvent,
                data: { kind: 'startup', buildId: info.buildId }
            })
        )
        // Only the applied frontier changes; each later patch must exclude the acknowledged prefix.
        let appliedSeq = 0
        for (const generation of [1, 2]) {
            const patch = nextPatch(socket)
            const marker = `Taobao generation ${generation}`
            await writeFile(
                path.join(root, 'src/pages/home.tsx'),
                `export default function Home() { return <view>${marker}</view> }`
            )
            const payload = await patch
            assert.equal(payload.buildId, info.buildId)
            assert.ok(payload.patches.every(({ seq }) => seq > appliedSeq))
            assert.ok(payload.patches.some(({ code }) => code.includes(marker)))
            appliedSeq = payload.patches.at(-1)!.seq
            const report = { kind: 'applied', buildId: info.buildId, seq: appliedSeq } as const
            const receipt = new Promise<unknown>((resolve) => {
                const receive = (data: unknown) => {
                    server.ws.off(runtimeReportEvent, receive)
                    resolve(data)
                }
                server.ws.on(runtimeReportEvent, receive)
            })
            socket.send(JSON.stringify({ type: 'custom', event: runtimeReportEvent, data: report }))
            assert.deepEqual(await receipt, report)
        }
        assert.equal(await readFile(infoPath, 'utf8'), infoSource)
    } finally {
        await server.close()
        await rm(root, { recursive: true, force: true })
    }
})

async function waitForFile(file: string, attemptsRemaining: number): Promise<void> {
    if (existsSync(file)) {
        return
    }
    assert.ok(attemptsRemaining > 0, `Timed out waiting for ${file}`)
    await delay(10)
    await waitForFile(file, attemptsRemaining - 1)
}

async function nextPatch(socket: WebSocket): Promise<InterpreterServerMessage> {
    // Vite also sends its initial connected frame; only interpreter messages carry patch source.
    for (;;) {
        const [event] = await once(socket, 'message', { signal: AbortSignal.timeout(5_000) })
        const message: { event?: string; data: InterpreterServerMessage } = JSON.parse(event.data)
        if (message.event === interpreterServerEvent) {
            return message.data
        }
    }
}
