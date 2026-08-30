/*
 * Interpreter adapter injected into the App-global Rolldown runtime chunk. Vite's shared WebSocket publishes cumulative
 * registration source, Sval evaluates it, and the shared runtime owns the retained socket, graph application, and reports.
 */

import Sval from 'sval'
import type { HmrInfo } from '../../wx-hmr-protocol.ts'
import { WxHmrRuntime } from '../../wx-hmr-runtime.ts'
import {
    type InterpreterPatch,
    type InterpreterServerMessage,
    interpreterClientEvent,
    interpreterServerEvent
} from './interpreter-protocol.ts'

/** Interprets cumulative patch source received by the shared App-level HMR socket. */
class InterpreterHmrRuntime extends WxHmrRuntime {
    /** One installer and Sval scope retain interpreted factory closures for this App heap. */
    private readonly installPatch: (patch: InterpreterPatch) => void

    constructor() {
        super()
        const interpreter = new Sval()
        interpreter.import('__rolldown_runtime__', this)
        this.installPatch = (patch) => interpreter.run(patch.code)
    }

    protected override onSocketOpen(info: HmrInfo): void {
        this.sendSocketEvent(interpreterClientEvent, { buildId: info.buildId })
    }

    protected override onSocketEvent(info: HmrInfo, event: string, data: unknown): void {
        if (event !== interpreterServerEvent) return

        const message = data as InterpreterServerMessage
        if (message.buildId !== info.buildId || !this.applyPatchPayload(message, this.installPatch)) {
            this.stopSocket('patch application stopped')
        }
    }
}

// The App-global singleton owns interpreted factory closures while its base owns socket, module cache, and Refresh boundaries.
const runtime = new InterpreterHmrRuntime()
;(globalThis as { __rolldown_runtime__?: InterpreterHmrRuntime }).__rolldown_runtime__ = runtime
