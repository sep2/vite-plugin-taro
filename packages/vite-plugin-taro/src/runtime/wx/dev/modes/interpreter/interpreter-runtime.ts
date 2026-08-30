/*
 * Interpreter adapter injected into the App-global Rolldown runtime chunk. Vite's existing WebSocket publishes cumulative
 * registration source, Sval evaluates it, and the shared runtime owns sequence validation, graph application, and reports.
 */

import Sval from 'sval'
import { type HmrInfo, WxHmrRuntime } from '../../wx-hmr-runtime.ts'
import {
    type InterpreterPatch,
    type InterpreterServerMessage,
    interpreterClientEvent,
    interpreterServerEvent
} from './interpreter-protocol.ts'

type InterpreterHmrInfo = HmrInfo & Readonly<{ socketEndpoint: string }>

type ViteSocketEnvelope = Readonly<{
    type: string
    event?: string
    data?: InterpreterServerMessage
}>

/** Receives and interprets cumulative patch source while the App heap remains alive. */
class InterpreterHmrRuntime extends WxHmrRuntime {
    /** One installer and Sval scope retain interpreted factory closures for this App heap. */
    private readonly installPatch: (patch: InterpreterPatch) => void

    /** Mutable identity of the sole live SocketTask; replacement makes every old callback fail an exact reference check. */
    private socket: WeChatSocketTask | undefined

    constructor() {
        super()
        const interpreter = new Sval()
        interpreter.import('__rolldown_runtime__', this)
        this.installPatch = (patch) => interpreter.run(patch.code)
    }

    override initialize(info: HmrInfo): void {
        super.initialize(info)

        if (this.socket) {
            return
        }

        if (!info.socketEndpoint) {
            throw new Error('WX interpreter HMR metadata is missing socketEndpoint.')
        }

        this.connect({ ...info, socketEndpoint: info.socketEndpoint })
    }

    /** Opens one socket and subscribes its build to replay any journal suffix missed while disconnected. */
    private connect(info: InterpreterHmrInfo): void {
        const socket = wx.connectSocket({
            url: info.socketEndpoint,
            protocols: ['vite-hmr']
        })
        this.socket = socket

        socket.onOpen(() => {
            if (socket !== this.socket) {
                socket.close({ code: 1000, reason: 'replaced' })
                return
            }
            socket.send({
                data: JSON.stringify({
                    type: 'custom',
                    event: interpreterClientEvent,
                    data: { buildId: info.buildId }
                }),
                fail: () => this.reconnect(info, socket)
            })
        })
        socket.onMessage(({ data }) => {
            if (socket !== this.socket) return

            const message = parseInterpreterMessage(data)
            if (message) {
                this.applyServerMessage(info, socket, message)
            }
        })
        socket.onClose(() => this.reconnect(info, socket))
        socket.onError(() => this.reconnect(info, socket))
    }

    private applyServerMessage(
        info: InterpreterHmrInfo,
        socket: WeChatSocketTask,
        message: InterpreterServerMessage
    ): void {
        switch (message.kind) {
            case 'patches':
                if (message.buildId !== info.buildId || !this.applyPatchPayload(message, this.installPatch)) {
                    this.stop(socket, 'patch application stopped')
                }
                return
            case 'close':
                this.stop(socket, message.reason)
                return
        }
    }

    private reconnect(info: InterpreterHmrInfo, socket: WeChatSocketTask): void {
        if (socket === this.socket) {
            this.connect(info)
        }
    }

    private stop(socket: WeChatSocketTask, reason: string): void {
        this.socket = undefined
        socket.close({ code: 1000, reason: reason })
    }
}

function parseInterpreterMessage(data: string | ArrayBuffer): InterpreterServerMessage | undefined {
    if (typeof data !== 'string') {
        return undefined
    }

    const envelope = JSON.parse(data) as ViteSocketEnvelope
    if (envelope.type !== 'custom' || envelope.event !== interpreterServerEvent) {
        return undefined
    }
    return envelope.data
}

// The App-global singleton owns the socket, interpreted factory closures, module cache, and React Refresh boundaries.
const runtime = new InterpreterHmrRuntime()
;(globalThis as { __rolldown_runtime__?: InterpreterHmrRuntime }).__rolldown_runtime__ = runtime
