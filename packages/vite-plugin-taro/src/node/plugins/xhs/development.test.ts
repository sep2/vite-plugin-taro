import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'vite'
import {
    type InterpreterServerMessage,
    interpreterServerEvent
} from '../../../runtime/mini/dev/modes/interpreter/interpreter-protocol.ts'
import { createTestProject } from '../../tests/create-test-project.ts'
import { publishSourceGeneration } from '../../tests/publish-source-generation.ts'
import vpt from '../../vpt.ts'
import { hmrInfoFileName } from '../mini/dev/hmr-files.ts'
import type { HmrInfo } from '../mini/dev/hmr-protocol.ts'

/** Observes the host's durable App marker, which is published after all initial development files. */
async function readAppMarker(filename: string): Promise<string> {
    // This local counter bounds polling while the asynchronous output transaction completes.
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
        try {
            const source = await readFile(filename, 'utf8')
            if (source.includes('vpt-build:')) {
                return source
            }
        } catch (error) {
            if (!Error.isError(error) || !('code' in error) || error.code !== 'ENOENT') {
                throw error
            }
        }
        await delay(25)
    }
    throw new Error('XHS development output did not publish its App marker')
}

test('publishes XHS development CSS, native templates, and interpreter updates through Vite', {
    timeout: 30_000
}, async (context) => {
    const root = await createTestProject('xhs-development-')
    const pagePath = path.join(root, 'src/pages/home/index.tsx')
    await mkdir(path.dirname(pagePath), { recursive: true })
    await writeFile(path.join(root, 'src/app.tsx'), 'export default function App({ children }) { return children }')
    await writeFile(pagePath, 'import "./index.css"; export default function Home() { return <div>XHS baseline</div> }')
    await writeFile(path.join(path.dirname(pagePath), 'index.css'), '.page { padding: 4px }')
    const server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: vpt({
            target: 'xhs',
            app: 'src/app.tsx',
            pages: [{ path: 'pages/home/index' }],
            appJson: {},
            projectConfigJson: { appid: 'xhs-development' },
            projectPrivateConfigJson: { setting: { urlCheck: false } },
            hmr: { mode: 'interpreter' }
        }),
        build: { outDir: 'dist' },
        server: { host: '127.0.0.1' }
    })
    context.after(() => server.close())
    await server.listen()
    const outDir = path.join(root, 'dist')
    const markerPath = path.join(outDir, 'app.css')
    const marker = await readAppMarker(markerPath)
    assert.deepEqual(JSON.parse(await readFile(path.join(outDir, 'project.private.config.json'), 'utf8')), {
        setting: { urlCheck: false }
    })
    assert.match(marker, /@import "\.\/assets\/global.css"/)
    assert.match(await readFile(path.join(outDir, 'pages/home/index.css'), 'utf8'), /padding:\s*4rpx/)
    assert.match(await readFile(path.join(outDir, 'base.xhsml'), 'utf8'), /xhs:for=/)
    const infoSource = await readFile(path.join(outDir, hmrInfoFileName), 'utf8')
    const info: HmrInfo = JSON.parse(infoSource.slice('module.exports = Object.freeze('.length, -');\n'.length))
    const socket = new WebSocket(info.endpoint, ['vite-hmr'])
    context.after(() => socket.close())
    await once(socket, 'open', { signal: context.signal })
    const patches = Promise.withResolvers<InterpreterServerMessage>()
    socket.addEventListener('message', (event) => {
        if (typeof event.data === 'string') {
            const envelope: { event?: string; data?: InterpreterServerMessage } = JSON.parse(event.data)
            if (envelope.event === interpreterServerEvent && envelope.data) {
                patches.resolve(envelope.data)
            }
        }
    })
    await publishSourceGeneration(
        pagePath,
        'import "./index.css"; export default function Home() { return <div>XHS hot update</div> }'
    )
    const message = await patches.promise
    assert.equal(message.kind, 'patches')
    if (message.kind !== 'patches') {
        assert.fail('Expected an XHS interpreter patch')
    }
    assert.match(message.patches.map(({ code }) => code).join('\n'), /XHS hot update/)
    assert.equal(await readFile(markerPath, 'utf8'), marker)
    assert.equal(await readFile(path.join(outDir, hmrInfoFileName), 'utf8'), infoSource)
})
