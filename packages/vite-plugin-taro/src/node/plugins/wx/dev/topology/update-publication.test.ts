import assert from 'node:assert/strict'
import test from 'node:test'
import { ReplaySubject, Subject } from 'rxjs'
import type { PatchHistory, UpdatePoll, UpdateWriteResult, WriteUpdateCommand } from './types.ts'
import { createUpdateCommands$ } from './update-publication.ts'

test('emits missing-range commands only after polls and serializes them by write results', () => {
    const history$ = new ReplaySubject<PatchHistory>(1)
    const polls$ = new Subject<UpdatePoll>()
    const updateWriteResults$ = new Subject<UpdateWriteResult>()
    const commands: WriteUpdateCommand[] = []
    const subscription = createUpdateCommands$({
        buildId: 'build-1',
        history$,
        polls$,
        updateWriteResults$
    }).subscribe((command) => commands.push(command))

    history$.next({ patches: [] })
    polls$.next(poll(0))
    assert.equal(commands.length, 0)

    history$.next({ patches: [{ patch: { code: 'first', fileName: 'src/first.ts' }, version: 1 }] })
    assert.deepEqual(publicationIds(commands), [1])
    assert.deepEqual(versions(commands[0]), [1])

    polls$.next(poll(0))
    assert.deepEqual(publicationIds(commands), [1])

    updateWriteResults$.next({ buildId: 'build-1', ok: true, publicationId: 1 })
    assert.deepEqual(publicationIds(commands), [1, 2])
    assert.deepEqual(versions(commands[1]), [1])

    updateWriteResults$.next({ buildId: 'build-1', ok: true, publicationId: 2 })
    history$.next({
        patches: [
            { patch: { code: 'first', fileName: 'src/first.ts' }, version: 1 },
            { patch: { code: 'second', fileName: 'src/second.ts' }, version: 2 }
        ]
    })
    polls$.next(poll(1))
    assert.deepEqual(publicationIds(commands), [1, 2, 3])
    assert.deepEqual(versions(commands[2]), [2])

    subscription.unsubscribe()
})

test('a failed write result releases the next poll to retry without a timer', () => {
    const history$ = new ReplaySubject<PatchHistory>(1)
    const polls$ = new Subject<UpdatePoll>()
    const updateWriteResults$ = new Subject<UpdateWriteResult>()
    const commands: WriteUpdateCommand[] = []
    const subscription = createUpdateCommands$({
        buildId: 'build-1',
        history$,
        polls$,
        updateWriteResults$
    }).subscribe((command) => commands.push(command))

    history$.next({ patches: [{ patch: { code: 'first', fileName: 'src/first.ts' }, version: 1 }] })
    polls$.next(poll(0))
    polls$.next(poll(0))
    updateWriteResults$.next({
        buildId: 'build-1',
        error: new Error('disk unavailable'),
        ok: false,
        publicationId: 1
    })

    assert.deepEqual(publicationIds(commands), [1, 2])
    subscription.unsubscribe()
})

test('captures synchronous write feedback produced while commands are consumed', () => {
    const history$ = new ReplaySubject<PatchHistory>(1)
    const polls$ = new Subject<UpdatePoll>()
    const updateWriteResults$ = new Subject<UpdateWriteResult>()
    const commands: WriteUpdateCommand[] = []
    const subscription = createUpdateCommands$({
        buildId: 'build-1',
        history$,
        polls$,
        updateWriteResults$
    }).subscribe((command) => {
        commands.push(command)
        updateWriteResults$.next({
            buildId: command.publication.buildId,
            ok: true,
            publicationId: command.publication.publicationId
        })
    })

    history$.next({ patches: [{ patch: { code: 'first', fileName: 'src/first.ts' }, version: 1 }] })
    polls$.next(poll(0))
    polls$.next(poll(0))

    assert.deepEqual(publicationIds(commands), [1, 2])
    subscription.unsubscribe()
})

test('ignores write results that do not identify the active publication', () => {
    const history$ = new ReplaySubject<PatchHistory>(1)
    const polls$ = new Subject<UpdatePoll>()
    const updateWriteResults$ = new Subject<UpdateWriteResult>()
    const commands: WriteUpdateCommand[] = []
    const subscription = createUpdateCommands$({
        buildId: 'build-1',
        history$,
        polls$,
        updateWriteResults$
    }).subscribe((command) => commands.push(command))

    history$.next({ patches: [{ patch: { code: 'first', fileName: 'src/first.ts' }, version: 1 }] })
    polls$.next(poll(0))
    polls$.next(poll(0))
    updateWriteResults$.next({ buildId: 'stale', ok: true, publicationId: 1 })
    updateWriteResults$.next({ buildId: 'build-1', ok: true, publicationId: 99 })
    assert.equal(commands.length, 1)

    updateWriteResults$.next({ buildId: 'build-1', ok: true, publicationId: 1 })
    assert.equal(commands.length, 2)

    subscription.unsubscribe()
})

function publicationIds(commands: readonly WriteUpdateCommand[]) {
    return commands.map(({ publication }) => publication.publicationId)
}

function versions(command: WriteUpdateCommand) {
    return command.publication.patches.map(({ version }) => version)
}

function poll(appliedVersion: number): UpdatePoll {
    return { appliedVersion, buildId: 'build-1', clientId: 'client-a' }
}
