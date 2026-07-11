/**
 * App-owned adapter for the WX update protocol.
 *
 * It transports metadata with wx.request and executes literal batches delivered through update.js. React/Taro page
 * preservation is delegated to page-update.ts so the App never depends on the mutable update file.
 */
import {
    createWxUpdateClientState,
    transitionWxUpdateClient,
    type WxUpdateClientCommand,
    type WxUpdateClientEvent
} from './update-client-state.ts'

type WxUpdateControl = {
    url: string
    token: string
    buildId: string
}

type WxUpdateBatchMetadata = {
    buildId: string
    fromVersion: number
    targetVersion: number
}

type WxRequestTask = {
    abort(): void
}

type WxRequestResult = {
    data?: unknown
}

type WxPageUpdateCoordinator = {
    ready: boolean
    pendingUpdate?: () => void
    beginUpdate?: () => void
    endUpdate?: () => void
}

export type WxUpdateClient = {
    receiveBatch(metadata: WxUpdateBatchMetadata, apply: () => void): void
    refreshCompleted(stale: boolean): void
    routeReady(): void
}

type WxClientGlobal = typeof globalThis & {
    __VITE_PLUGIN_TARO_WX_CONTROL__?: WxUpdateControl
    __VITE_PLUGIN_TARO_WX_UPDATE_CLIENT__?: WxUpdateClient
    __VITE_PLUGIN_TARO_WX_PAGE_UPDATE__?: WxPageUpdateCoordinator
    wx: {
        request(options: {
            url: string
            method: 'POST'
            data: unknown
            timeout: number
            success(result: WxRequestResult): void
            fail(error: { errMsg?: string }): void
        }): WxRequestTask
    }
}

const wxClientGlobal = globalThis as WxClientGlobal
const transportRetryDelay = 500
const rebuildPollDelay = 1_000
const updateFileWatchdogDelay = 2_000

export function startWxUpdateClient(): void {
    if (wxClientGlobal.__VITE_PLUGIN_TARO_WX_UPDATE_CLIENT__) return
    const control = wxClientGlobal.__VITE_PLUGIN_TARO_WX_CONTROL__
    if (!control) throw new Error('vite-plugin-taro could not find its WX update control configuration.')

    let state = createWxUpdateClientState(control.buildId)
    const sessionId = createSessionId()
    let requestGeneration = 0
    let activeRequest: WxRequestTask | undefined
    let scheduledRequest: ReturnType<typeof setTimeout> | undefined
    let pendingBatchApply: (() => void) | undefined

    const dispatch = (event: WxUpdateClientEvent, apply?: () => void): void => {
        const transition = transitionWxUpdateClient(state, event)
        state = transition.state
        for (const command of transition.commands) execute(command, apply)
    }

    const send = (action: 'register' | 'poll' | 'rebuild', version: number): void => {
        if (scheduledRequest) clearTimeout(scheduledRequest)
        scheduledRequest = undefined
        activeRequest?.abort()
        const generation = ++requestGeneration
        activeRequest = wxClientGlobal.wx.request({
            url: control.url,
            method: 'POST',
            data: {
                token: control.token,
                action,
                buildId: state.buildId,
                sessionId,
                version
            },
            timeout: 30_000,
            success(result) {
                if (generation !== requestGeneration) return
                activeRequest = undefined
                const response = parseResponse(result.data)
                if (action === 'register' && response.type === 'registered') {
                    dispatch({ type: 'registration-completed' })
                    return
                }
                if (action === 'poll' && (response.type === 'idle' || response.type === 'changed')) {
                    dispatch({ type: 'poll-completed' })
                    return
                }
                if (response.type === 'batch-published') {
                    // If DevTools misses the update.js event, report the unchanged version and republish with a new nonce.
                    scheduleRequest(updateFileWatchdogDelay)
                    return
                }
                if (response.type === 'rebuilding') {
                    scheduleRequest(rebuildPollDelay)
                    return
                }
                dispatch({ type: 'transport-failed' })
            },
            fail() {
                if (generation !== requestGeneration) return
                activeRequest = undefined
                dispatch({ type: 'transport-failed' })
            }
        })
    }

    /** Keeps exactly one delayed metadata request and discards it when protocol state advances. */
    const scheduleRequest = (delay: number): void => {
        if (scheduledRequest) clearTimeout(scheduledRequest)
        const expectedPhase = state.phase
        const expectedVersion = state.version
        scheduledRequest = setTimeout(() => {
            scheduledRequest = undefined
            if (state.phase !== expectedPhase || state.version !== expectedVersion) return
            send(state.phase === 'registering' ? 'register' : 'poll', state.version)
        }, delay)
    }

    const execute = (command: WxUpdateClientCommand, apply?: () => void): void => {
        switch (command.type) {
            case 'register':
                send('register', command.version)
                return
            case 'poll':
            case 'report-version':
                send('poll', command.version)
                return
            case 'apply-batch': {
                const batchApply = apply ?? pendingBatchApply
                pendingBatchApply = undefined
                if (!batchApply) {
                    dispatch({ type: 'batch-failed' })
                    return
                }
                const applyUpdate = () => {
                    const bridge = wxClientGlobal.__VITE_PLUGIN_TARO_WX_PAGE_UPDATE__
                    if (!bridge) {
                        dispatch({ type: 'batch-failed' })
                        return
                    }
                    bridge.beginUpdate?.()
                    try {
                        batchApply()
                        dispatch({ type: 'batch-executed', targetVersion: command.targetVersion })
                    } catch {
                        dispatch({ type: 'batch-failed' })
                    } finally {
                        bridge.endUpdate?.()
                    }
                }
                const bridge = wxClientGlobal.__VITE_PLUGIN_TARO_WX_PAGE_UPDATE__
                if (bridge?.ready) applyUpdate()
                else if (bridge) bridge.pendingUpdate = applyUpdate
                else dispatch({ type: 'batch-failed' })
                return
            }
            case 'request-full-build':
                send('rebuild', state.version)
                return
            case 'retry-transport':
                scheduleRequest(transportRetryDelay)
        }
    }

    wxClientGlobal.__VITE_PLUGIN_TARO_WX_UPDATE_CLIENT__ = {
        receiveBatch(metadata, apply) {
            dispatch({ type: 'batch-observed', ...metadata }, apply)
            if (
                state.pendingBatch?.fromVersion === metadata.fromVersion &&
                state.pendingBatch.targetVersion === metadata.targetVersion
            ) {
                pendingBatchApply = apply
            } else if (!state.pendingBatch && state.phase !== 'applying') {
                pendingBatchApply = undefined
            }
        },
        refreshCompleted(stale) {
            dispatch({ type: 'refresh-completed', stale })
        },
        routeReady() {
            dispatch({ type: 'route-ready' })
        }
    }
    dispatch({ type: 'started' })
}

function createSessionId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function parseResponse(value: unknown): { type: string } {
    if (typeof value !== 'object' || value === null || !('type' in value) || typeof value.type !== 'string') {
        return { type: 'invalid' }
    }
    return { type: value.type }
}
