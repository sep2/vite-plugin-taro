export type WxUpdateClientPhase = 'stopped' | 'registering' | 'polling' | 'applying' | 'refreshing' | 'relaunching'

export type WxUpdateClientState = {
    buildId: string
    version: number
    phase: WxUpdateClientPhase
    targetVersion?: number
    pendingBatch?: { fromVersion: number; targetVersion: number }
}

export type WxUpdateClientEvent =
    | { type: 'started' }
    | { type: 'registration-completed' }
    | { type: 'poll-completed' }
    | { type: 'batch-observed'; buildId: string; fromVersion: number; targetVersion: number }
    | { type: 'batch-executed'; targetVersion: number }
    | { type: 'batch-failed' }
    | { type: 'refresh-completed'; stale: boolean }
    | { type: 'route-ready' }
    | { type: 'transport-failed' }

export type WxUpdateClientCommand =
    | { type: 'register'; version: number }
    | { type: 'poll'; version: number }
    | { type: 'apply-batch'; fromVersion: number; targetVersion: number }
    | { type: 'report-version'; version: number; reason: 'applied' | 'batch-mismatch' }
    | { type: 'request-full-build'; reason: 'batch-execution-failed' }
    | { type: 'retry-transport' }

export type WxUpdateClientTransition = {
    state: WxUpdateClientState
    commands: WxUpdateClientCommand[]
}

export function createWxUpdateClientState(buildId: string): WxUpdateClientState {
    return { buildId, version: 0, phase: 'stopped' }
}

export function transitionWxUpdateClient(
    state: WxUpdateClientState,
    event: WxUpdateClientEvent
): WxUpdateClientTransition {
    switch (event.type) {
        case 'started':
            if (state.phase !== 'stopped') return transition(state)
            return command({ ...state, phase: 'registering' }, { type: 'register', version: state.version })
        case 'registration-completed': {
            if (state.phase !== 'registering') return transition(state)
            const pending = state.pendingBatch
            if (!pending) return command({ ...state, phase: 'polling' }, { type: 'poll', version: state.version })
            return command(
                { ...state, phase: 'applying', targetVersion: pending.targetVersion, pendingBatch: undefined },
                { type: 'apply-batch', ...pending }
            )
        }
        case 'poll-completed':
            if (state.phase !== 'polling') return transition(state)
            return command(state, { type: 'poll', version: state.version })
        case 'batch-observed':
            return observeBatch(state, event)
        case 'batch-executed':
            if (state.phase !== 'applying' || state.targetVersion !== event.targetVersion) {
                return command(state, { type: 'report-version', version: state.version, reason: 'batch-mismatch' })
            }
            return transition({ ...state, phase: 'refreshing', version: event.targetVersion })
        case 'batch-failed':
            return command(
                { ...state, phase: 'polling', targetVersion: undefined },
                { type: 'request-full-build', reason: 'batch-execution-failed' }
            )
        case 'refresh-completed':
            if (state.phase !== 'refreshing') return transition(state)
            if (event.stale) return transition({ ...state, phase: 'relaunching' })
            return applied(state)
        case 'route-ready':
            if (state.phase !== 'relaunching') return transition(state)
            return applied(state)
        case 'transport-failed':
            return command(state, { type: 'retry-transport' })
    }
}

function observeBatch(
    state: WxUpdateClientState,
    batch: { buildId: string; fromVersion: number; targetVersion: number }
): WxUpdateClientTransition {
    const valid =
        batch.buildId === state.buildId &&
        Number.isInteger(batch.fromVersion) &&
        Number.isInteger(batch.targetVersion) &&
        batch.fromVersion >= 0 &&
        batch.targetVersion > batch.fromVersion
    if (state.phase === 'registering') {
        if (!valid || batch.fromVersion !== state.version || batch.targetVersion <= state.version) {
            return transition(state)
        }
        return transition({
            ...state,
            pendingBatch: { fromVersion: batch.fromVersion, targetVersion: batch.targetVersion }
        })
    }
    if (!valid) {
        return command(state, { type: 'report-version', version: state.version, reason: 'batch-mismatch' })
    }
    if (batch.targetVersion <= state.version) {
        return command(state, { type: 'report-version', version: state.version, reason: 'applied' })
    }
    if (state.phase !== 'polling' || batch.fromVersion !== state.version) {
        return command(state, { type: 'report-version', version: state.version, reason: 'batch-mismatch' })
    }
    return command(
        { ...state, phase: 'applying', targetVersion: batch.targetVersion },
        {
            type: 'apply-batch',
            fromVersion: batch.fromVersion,
            targetVersion: batch.targetVersion
        }
    )
}

function applied(state: WxUpdateClientState): WxUpdateClientTransition {
    const appliedState = { ...state, phase: 'polling' as const, targetVersion: undefined }
    return command(appliedState, { type: 'report-version', version: state.version, reason: 'applied' })
}

function transition(state: WxUpdateClientState): WxUpdateClientTransition {
    return { state, commands: [] }
}

function command(state: WxUpdateClientState, value: WxUpdateClientCommand): WxUpdateClientTransition {
    return { state, commands: [value] }
}
