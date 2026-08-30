import assert from 'node:assert/strict'
import test from 'node:test'
import { createLogger, createServer } from 'vite'
import {
    type InterpreterServerMessage,
    interpreterServerEvent
} from '../../../../../../runtime/wx/dev/modes/interpreter/interpreter-protocol.ts'
import type { PatchUpdate } from '../../hmr-protocol.ts'
import { PatchJournal } from '../../patch-journal.ts'
import { createInterpreterHmrMode } from './interpreter-hmr-mode.ts'

const patch: PatchUpdate = {
    type: 'Patch',
    code: '__rolldown_runtime__.registerFactory("feature", "esm", factory)',
    filename: 'feature.js',
    changedIds: ['feature'],
    seq: 1
}

test('initializes only the App entry and installs no Page transform', () => {
    const mode = createInterpreterHmrMode()
    const banner = mode.createEntryBanner(new Set(['pages/home/index.js']))

    assert.equal(
        banner({ name: 'app.js', fileName: 'app.js' }),
        "__rolldown_runtime__.initialize(require('./hmr/info.js'));\n"
    )
    assert.equal(banner({ name: 'pages/home/index.js', fileName: 'pages/home/index.js' }), '')
    assert.deepEqual(mode.plugins, [])
    assert.equal(mode.usesWebSocket, true)
    assert.match(mode.runtimeFile, /wx\/dev\/modes\/interpreter\/interpreter-runtime\.(?:ts|js)$/)
})

test('publishes cumulative source through Vite WebSocket without writing a patch file', async (context) => {
    const mode = createInterpreterHmrMode()
    const server = await createServer({ configFile: false, customLogger: createLogger('silent') })
    context.after(() => server.close())

    const sent: Array<Readonly<{ event: string; message: InterpreterServerMessage }>> = []
    context.mock.method(server.ws, 'send', (event: string, message: InterpreterServerMessage) => {
        sent.push({ event: event, message: message })
    })

    const writeFile = async () => assert.fail('interpreter mode must not write a JavaScript patch file')
    const journal = new PatchJournal((publication) => mode.publish(server, publication, writeFile))
    mode.configureServer(server, journal)
    const { buildId } = journal.startBuild()

    await mode.reset(server, buildId, writeFile)
    await journal.produce([patch])
    await mode.close(server)

    assert.deepEqual(sent, [
        {
            event: interpreterServerEvent,
            message: { kind: 'patches', buildId: buildId, patches: [patch] }
        },
        { event: interpreterServerEvent, message: { kind: 'close', reason: 'host closed' } }
    ])
})
