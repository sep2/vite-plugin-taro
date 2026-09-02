/*
 * Interpreter adapter injected into the App-global Rolldown runtime chunk. Vite's shared WebSocket publishes cumulative
 * registration source, Sval evaluates it, and the shared runtime owns the retained socket, graph application, and reports.
 */

import Sval from 'sval'
import type { HmrInfo } from '../../hmr-protocol.ts'
import { type ConnectMiniSocket, MiniHmrRuntime } from '../../mini-hmr-runtime.ts'
import { type InterpreterPatch, type InterpreterServerMessage, interpreterServerEvent } from './interpreter-protocol.ts'

/** Interprets cumulative patch source received by the shared App-level HMR socket. */
class InterpreterHmrRuntime extends MiniHmrRuntime {
    /** One installer and Sval scope retain interpreted factory closures for this App heap. */
    private readonly installPatch: (patch: InterpreterPatch) => void

    constructor(connectSocket: ConnectMiniSocket) {
        super(connectSocket)
        const interpreter = new Sval()
        interpreter.import('__rolldown_runtime__', this)
        this.installPatch = (patch) => interpreter.run(patch.code)
    }

    protected override onSocketEvent(info: HmrInfo, event: string, data: unknown): void {
        if (event !== interpreterServerEvent) return

        const message = data as InterpreterServerMessage
        if (message.buildId !== info.buildId || !this.applyPatchPayload(message, this.installPatch)) {
            this.stopSocket('patch application stopped')
        }
    }
}

/** Creates one platform-connected interpreter for installation by a thin target runtime entry. */
export function createInterpreterHmrRuntime(connectSocket: ConnectMiniSocket): InterpreterHmrRuntime {
    return new InterpreterHmrRuntime(connectSocket)
}
