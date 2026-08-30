import type { ViteDevServer, WebSocketClient } from 'vite'
import {
    type InterpreterServerMessage,
    type InterpreterSubscription,
    interpreterClientEvent,
    interpreterServerEvent
} from '../../../../../../runtime/wx/dev/modes/interpreter/interpreter-protocol.ts'
import { type RuntimeControlMessage, runtimeControlEvent } from '../../../../../../runtime/wx/dev/wx-hmr-protocol.ts'
import { resolveRuntimeFile } from '../../../../../utils/packages.ts'
import { appShellFileName } from '../../../module/module.ts'
import { hmrInfoFileName } from '../../hmr-files.ts'
import type { WxHmrMode } from '../../hmr-mode.ts'
import type { PatchPublication } from '../../hmr-protocol.ts'
import type { PatchJournal } from '../../patch-journal.ts'

declare module 'vite' {
    interface CustomEventMap {
        'vpt:wx-interpreter:subscribe': InterpreterSubscription
        'vpt:wx-interpreter:source': InterpreterServerMessage
        'vpt:wx-hmr:control': RuntimeControlMessage
    }
}

const interpreterRuntimeFile = resolveRuntimeFile('wx/dev/modes/interpreter/interpreter-runtime')

/** Creates interpreter HMR as a thin adapter over Vite's existing WebSocket channel. */
export function createInterpreterHmrMode(): WxHmrMode {
    return {
        runtimeFile: interpreterRuntimeFile,
        plugins: [],
        createEntryBanner: createInterpreterEntryBanner,
        configureServer: installSubscriptionHandler,
        // Build identity already travels with every publication and initial subscription.
        reset: async () => {},
        publish: async (server, publication) => {
            server.ws.send(interpreterServerEvent, toSourceMessage(publication))
        }
    }
}

/** Replays the journal suffix when an App heap first subscribes after potentially missing an early broadcast. */
function installSubscriptionHandler(server: ViteDevServer, journal: PatchJournal): void {
    server.ws.on(interpreterClientEvent, (subscription, client) => {
        publishCurrentJournal(client, journal.current, subscription)
    })
}

function publishCurrentJournal(
    client: WebSocketClient,
    publication: PatchPublication | undefined,
    subscription: InterpreterSubscription
): void {
    if (!publication) {
        return
    }
    if (publication.buildId !== subscription.buildId) {
        client.send(runtimeControlEvent, { kind: 'close', reason: 'build replaced' })
        return
    }
    if (publication.patches.length > 0) {
        client.send(interpreterServerEvent, toSourceMessage(publication))
    }
}

function toSourceMessage(publication: PatchPublication): InterpreterServerMessage {
    return {
        kind: 'patches',
        buildId: publication.buildId,
        patches: publication.patches
    }
}

/** Interpreter runtime starts from App only; Pages have no patch edge or lifecycle handoff. */
function createInterpreterEntryBanner() {
    return (chunk: Readonly<{ name: string; fileName: string }>): string => {
        if (chunk.name === appShellFileName) {
            return `__rolldown_runtime__.initialize(require('./${hmrInfoFileName}'));\n`
        }
        return ''
    }
}
