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
        // Trusted application patches share live host globals, including APIs installed during app startup, rather than Sval's
        // module-time sandbox snapshot. A function scope keeps patch-local declarations isolated, as in native HMR factories.
        const interpreter = new Sval({ sandBox: false })
        // Bind this interpreter's runtime once; Sval also publishes the same singleton on its selected global object.
        interpreter.import({ __rolldown_runtime__: this })
        this.installPatch = (patch) => interpreter.run(`(() => {\n${patch.code}\n})();`)
    }

    protected override onSocketEvent(info: HmrInfo, event: string, data: unknown): void {
        if (event !== interpreterServerEvent) {
            return
        }

        const message = data as InterpreterServerMessage
        if (message.buildId !== info.buildId) {
            this.stopSocket('patch application stopped')
            return
        }
        this.applyPatchPayload(message, this.installPatch)
    }
}

/** Creates one platform-connected interpreter for installation by a thin target runtime entry. */
export function createInterpreterHmrRuntime(connectSocket: ConnectMiniSocket): InterpreterHmrRuntime {
    return new InterpreterHmrRuntime(connectSocket)
}
