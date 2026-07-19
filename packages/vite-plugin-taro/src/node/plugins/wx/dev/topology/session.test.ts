import assert from 'node:assert/strict'
import test from 'node:test'
import { Subject } from 'rxjs'
import { createHmrTopology } from './session.ts'
import type {
    BootstrapWriteResult,
    BuildRequest,
    CompleteBuildResult,
    HmrCommand,
    SafePatch,
    SafePatchFact,
    UpdatePoll,
    UpdateWriteResult
} from './types.ts'

test('commands a complete baseline before accepting patches and resets publication versions after replacement', () => {
    const harness = createHarness()

    activateBuild(harness, 'build-1', 'initial')
    harness.safePatches$.next(patchFact('build-1', 'first'))
    assert.deepEqual(kinds(harness), ['run-build', 'write-bootstrap'])

    harness.polls$.next(poll('build-1', 'client-a', 0))
    assert.deepEqual(kinds(harness), ['run-build', 'write-bootstrap', 'write-update'])
    assert.deepEqual(publications(harness), [['build-1', 1, [1]]])

    harness.buildRequests$.next(request('build-2', 'native-output-changed'))
    harness.safePatches$.next(patchFact('build-1', 'stale'))
    harness.polls$.next(poll('build-1', 'client-a', 0))
    assert.deepEqual(kinds(harness), ['run-build', 'write-bootstrap', 'write-update', 'run-build'])

    harness.completeBuildResults$.next({ buildId: 'build-2', ok: true })
    harness.bootstrapWriteResults$.next({ buildId: 'build-2', ok: true })
    harness.safePatches$.next(patchFact('build-2', 'replacement'))
    harness.polls$.next(poll('build-2', 'client-a', 0))

    assert.deepEqual(publications(harness), [
        ['build-1', 1, [1]],
        ['build-2', 1, [1]]
    ])
    harness.subscription.unsubscribe()
})

test('patch facts never directly command a physical update', () => {
    const harness = createHarness()
    activateBuild(harness, 'build-1', 'initial')

    harness.safePatches$.next(patchFact('build-1', 'first'))
    harness.safePatches$.next(patchFact('build-1', 'second'))

    assert.equal(
        harness.commands.some((command) => command.kind === 'write-update'),
        false
    )
    harness.subscription.unsubscribe()
})

test('stops the epoch and requests a rebuild when another WX heap polls', () => {
    const harness = createHarness()
    activateBuild(harness, 'build-1', 'initial')
    harness.safePatches$.next(patchFact('build-1', 'first'))

    harness.polls$.next(poll('build-1', 'client-a', 0))
    harness.polls$.next(poll('build-1', 'client-b', 0))
    harness.polls$.next(poll('build-1', 'client-a', 0))

    assert.deepEqual(rebuildCommands(harness), [
        { buildId: 'build-1', kind: 'request-rebuild', reason: 'client-changed' }
    ])
    assert.equal(harness.commands.filter((command) => command.kind === 'write-update').length, 1)
    harness.subscription.unsubscribe()
})

test('stops at the retained history bound instead of retaining or publishing beyond it', () => {
    const harness = createHarness(2)
    activateBuild(harness, 'build-1', 'initial')

    harness.safePatches$.next(patchFact('build-1', 'first'))
    harness.safePatches$.next(patchFact('build-1', 'second'))
    harness.polls$.next(poll('build-1', 'client-a', 0))
    harness.safePatches$.next(patchFact('build-1', 'third'))

    assert.deepEqual(rebuildCommands(harness), [
        { buildId: 'build-1', kind: 'request-rebuild', reason: 'history-limit' }
    ])
    assert.equal(
        harness.commands.some((command) => command.kind === 'write-update'),
        false
    )
    harness.subscription.unsubscribe()
})

for (const appliedVersion of [-1, 1]) {
    test(`stops when runtime version ${appliedVersion} is outside empty retained history`, () => {
        const harness = createHarness()
        activateBuild(harness, 'build-1', 'initial')

        harness.polls$.next(poll('build-1', 'client-a', appliedVersion))

        assert.deepEqual(rebuildCommands(harness), [
            { buildId: 'build-1', kind: 'request-rebuild', reason: 'runtime-desynchronized' }
        ])
        harness.subscription.unsubscribe()
    })
}

test('ignores stale patch and poll facts from other build epochs', () => {
    const harness = createHarness()
    activateBuild(harness, 'build-1', 'initial')

    harness.safePatches$.next(patchFact('stale', 'stale'))
    harness.polls$.next(poll('stale', 'client-a', 0))
    assert.deepEqual(kinds(harness), ['run-build', 'write-bootstrap'])

    harness.subscription.unsubscribe()
})

test('request-rebuild is a command and does not invent a build ID or start a build itself', () => {
    const harness = createHarness()
    activateBuild(harness, 'build-1', 'initial')
    harness.polls$.next(poll('build-1', 'client-a', 1))

    assert.deepEqual(kinds(harness), ['run-build', 'write-bootstrap', 'request-rebuild'])

    harness.buildRequests$.next(request('edge-created-build-2', 'runtime-desynchronized'))
    assert.deepEqual(kinds(harness), ['run-build', 'write-bootstrap', 'request-rebuild', 'run-build'])
    harness.subscription.unsubscribe()
})

test('rejects an invalid history bound before any fact stream is subscribed', () => {
    const facts = createFacts()
    assert.throws(() => createHmrTopology(facts, { maximumPatchCount: 0 }), /maximumPatchCount/)
})

type Harness = ReturnType<typeof createHarness>

function createHarness(maximumPatchCount = 10) {
    const facts = createFacts()
    const commands: HmrCommand[] = []
    const subscription = createHmrTopology(facts, { maximumPatchCount }).subscribe((command) => commands.push(command))
    return { ...facts, commands, subscription }
}

function createFacts() {
    return {
        bootstrapWriteResults$: new Subject<BootstrapWriteResult>(),
        buildRequests$: new Subject<BuildRequest>(),
        completeBuildResults$: new Subject<CompleteBuildResult>(),
        polls$: new Subject<UpdatePoll>(),
        safePatches$: new Subject<SafePatchFact>(),
        updateWriteResults$: new Subject<UpdateWriteResult>()
    }
}

function activateBuild(harness: Harness, buildId: string, reason: BuildRequest['reason']) {
    harness.buildRequests$.next(request(buildId, reason))
    harness.completeBuildResults$.next({ buildId, ok: true })
    harness.bootstrapWriteResults$.next({ buildId, ok: true })
}

function kinds(harness: Harness) {
    return harness.commands.map(({ kind }) => kind)
}

function rebuildCommands(harness: Harness) {
    return harness.commands.filter(
        (command): command is Extract<HmrCommand, { kind: 'request-rebuild' }> => command.kind === 'request-rebuild'
    )
}

function publications(harness: Harness) {
    return harness.commands
        .filter((command): command is Extract<HmrCommand, { kind: 'write-update' }> => command.kind === 'write-update')
        .map(({ publication }) => [
            publication.buildId,
            publication.publicationId,
            publication.patches.map(({ version }) => version)
        ])
}

function request(buildId: string, reason: BuildRequest['reason']): BuildRequest {
    return { buildId, reason }
}

function poll(buildId: string, clientId: string, appliedVersion: number): UpdatePoll {
    return { appliedVersion, buildId, clientId }
}

function patchFact(buildId: string, code: string): SafePatchFact {
    return { buildId, patch: patch(code) }
}

function patch(code: string): SafePatch {
    return { code, fileName: `src/${code}.ts` }
}
