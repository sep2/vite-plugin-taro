export type WxUpdateDelta = {
    version: number
    code: string
}

export type WxUpdateBatch = {
    buildId: string
    sessionId: string
    fromVersion: number
    targetVersion: number
    deltas: WxUpdateDelta[]
}

export type WxUpdateServerState = {
    buildId: string
    hostVersion: number
    deltas: WxUpdateDelta[]
    activeSessionId?: string
    retiredSessionIds: string[]
    inFlight?: Pick<WxUpdateBatch, 'sessionId' | 'fromVersion' | 'targetVersion'>
}

export type WxUpdateServerEvent =
    | { type: 'delta-added'; code: string }
    | { type: 'client-registered'; buildId: string; sessionId: string; version: number }
    | { type: 'client-reported'; buildId: string; sessionId: string; version: number }
    | { type: 'batch-publish-failed'; sessionId: string; targetVersion: number }
    | { type: 'full-build-committed'; buildId: string }

export type WxUpdateServerCommand =
    | { type: 'publish-batch'; batch: WxUpdateBatch }
    | { type: 'request-full-build'; reason: 'client-version-ahead' | 'invalid-client-version' }
    | { type: 'ignore-client'; reason: 'stale-build' | 'retired-session' | 'unknown-session' }

export type WxUpdateServerTransition = {
    state: WxUpdateServerState
    commands: WxUpdateServerCommand[]
}

export function createWxUpdateServerState(buildId: string): WxUpdateServerState {
    return {
        buildId,
        hostVersion: 0,
        deltas: [],
        retiredSessionIds: []
    }
}

export function transitionWxUpdateServer(
    state: WxUpdateServerState,
    event: WxUpdateServerEvent
): WxUpdateServerTransition {
    switch (event.type) {
        case 'delta-added': {
            const version = state.hostVersion + 1
            return transition({
                ...state,
                hostVersion: version,
                deltas: [...state.deltas, { version, code: event.code }]
            })
        }
        case 'client-registered':
            return registerClient(state, event)
        case 'client-reported':
            return reportClient(state, event)
        case 'batch-publish-failed':
            if (state.inFlight?.sessionId !== event.sessionId || state.inFlight.targetVersion !== event.targetVersion) {
                return transition(state)
            }
            return transition({ ...state, inFlight: undefined })
        case 'full-build-committed':
            return transition(createWxUpdateServerState(event.buildId))
    }
}

function registerClient(
    state: WxUpdateServerState,
    client: { buildId: string; sessionId: string; version: number }
): WxUpdateServerTransition {
    const rejected = rejectClient(state, client)
    if (rejected) return rejected
    if (state.retiredSessionIds.includes(client.sessionId)) {
        return command(state, { type: 'ignore-client', reason: 'retired-session' })
    }
    if (state.activeSessionId === client.sessionId) return transition(state)

    const retiredSessionIds = state.activeSessionId
        ? [...new Set([...state.retiredSessionIds, state.activeSessionId])]
        : state.retiredSessionIds
    const registered = {
        ...state,
        activeSessionId: client.sessionId,
        retiredSessionIds,
        inFlight: undefined
    }
    return transition(registered)
}

function reportClient(
    state: WxUpdateServerState,
    client: { buildId: string; sessionId: string; version: number }
): WxUpdateServerTransition {
    const rejected = rejectClient(state, client)
    if (rejected) return rejected
    if (state.retiredSessionIds.includes(client.sessionId)) {
        return command(state, { type: 'ignore-client', reason: 'retired-session' })
    }
    if (client.sessionId !== state.activeSessionId) {
        return command(state, { type: 'ignore-client', reason: 'unknown-session' })
    }
    return synchronizeClient(state, client.version)
}

function rejectClient(
    state: WxUpdateServerState,
    client: { buildId: string; version: number }
): WxUpdateServerTransition | undefined {
    if (client.buildId !== state.buildId) {
        return command(state, { type: 'ignore-client', reason: 'stale-build' })
    }
    if (!Number.isInteger(client.version) || client.version < 0) {
        return command(state, { type: 'request-full-build', reason: 'invalid-client-version' })
    }
    if (client.version > state.hostVersion) {
        return command(state, { type: 'request-full-build', reason: 'client-version-ahead' })
    }
}

function synchronizeClient(state: WxUpdateServerState, clientVersion: number): WxUpdateServerTransition {
    let synchronized = state
    const inFlight = state.inFlight
    if (inFlight) {
        if (clientVersion === inFlight.fromVersion) {
            const batch = createBatch(state, clientVersion, inFlight.targetVersion)
            return command(state, { type: 'publish-batch', batch })
        }
        if (clientVersion !== inFlight.targetVersion) {
            return command(state, { type: 'request-full-build', reason: 'invalid-client-version' })
        }
        synchronized = { ...state, inFlight: undefined }
    }
    if (clientVersion >= synchronized.hostVersion) return transition(synchronized)

    const batch = createBatch(synchronized, clientVersion, synchronized.hostVersion)
    return command(
        {
            ...synchronized,
            inFlight: {
                sessionId: batch.sessionId,
                fromVersion: batch.fromVersion,
                targetVersion: batch.targetVersion
            }
        },
        { type: 'publish-batch', batch }
    )
}

function createBatch(state: WxUpdateServerState, fromVersion: number, targetVersion: number): WxUpdateBatch {
    return {
        buildId: state.buildId,
        sessionId: state.activeSessionId!,
        fromVersion,
        targetVersion,
        deltas: state.deltas.filter((delta) => delta.version > fromVersion && delta.version <= targetVersion)
    }
}

function transition(state: WxUpdateServerState): WxUpdateServerTransition {
    return { state, commands: [] }
}

function command(state: WxUpdateServerState, value: WxUpdateServerCommand): WxUpdateServerTransition {
    return { state, commands: [value] }
}
