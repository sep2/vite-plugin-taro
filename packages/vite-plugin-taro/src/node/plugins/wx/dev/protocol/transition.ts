import type { DevProtocolEvent, DevProtocolState, DevProtocolTransition } from './model.ts'

/**
 * Reduces the smallest useful WX development lifecycle.
 *
 * Client identity has one rule: the first heap becomes active, repeat messages from it are idempotent, and a different
 * heap requires a complete physical rebuild. HMR patch flow is deliberately absent until the physical patch writer and
 * runtime acknowledgement protocol are introduced.
 */
export function transition(state: DevProtocolState, event: DevProtocolEvent): DevProtocolTransition {
    if (state.phase === 'stopped') {
        return unchanged(state)
    }

    if (event.type === 'stop') {
        return {
            state: { buildId: state.buildId, phase: 'stopped' },
            commands: [{ type: 'close-session' }]
        }
    }

    if (state.phase === 'starting') {
        return event.type === 'ready'
            ? { state: { buildId: state.buildId, phase: 'awaiting-client' }, commands: [] }
            : unchanged(state)
    }

    if (state.phase === 'awaiting-client') {
        return event.type === 'client-connected'
            ? { state: { buildId: state.buildId, clientId: event.clientId, phase: 'active' }, commands: [] }
            : unchanged(state)
    }

    if (state.phase === 'active') {
        if (event.type !== 'client-connected' || event.clientId === state.clientId) {
            return unchanged(state)
        }

        return {
            state: { buildId: state.buildId, nextClientId: event.clientId, phase: 'rebuilding' },
            commands: [{ type: 'full-rebuild', clientId: event.clientId }]
        }
    }

    return event.type === 'rebuild-finished'
        ? { state: { buildId: state.buildId, clientId: state.nextClientId, phase: 'active' }, commands: [] }
        : unchanged(state)
}

/**
 * Represents an event that cannot alter the current lifecycle state.
 *
 * Returning the original state reference lets future RxJS consumers distinguish an ignored event without comparing
 * object contents.
 */
function unchanged(state: DevProtocolState): DevProtocolTransition {
    return { state, commands: [] }
}
