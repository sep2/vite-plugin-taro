import assert from 'node:assert/strict'
import test from 'node:test'
import { Subject } from 'rxjs'
import { createPatchHistory$ } from './patch-history.ts'
import type { PatchHistory, SafePatch } from './types.ts'

test('retains safe patches in a replayed contiguous history without publishing a physical update', () => {
    const safePatches$ = new Subject<SafePatch>()
    const histories: PatchHistory[] = []
    const history$ = createPatchHistory$(safePatches$)
    const subscription = history$.subscribe((history) => histories.push(history))

    safePatches$.next({ code: 'first', fileName: 'src/first.ts' })
    safePatches$.next({ code: 'second', fileName: 'src/second.ts' })

    assert.deepEqual(histories, [
        { patches: [] },
        { patches: [{ patch: { code: 'first', fileName: 'src/first.ts' }, version: 1 }] },
        {
            patches: [
                { patch: { code: 'first', fileName: 'src/first.ts' }, version: 1 },
                { patch: { code: 'second', fileName: 'src/second.ts' }, version: 2 }
            ]
        }
    ])

    const replayed: PatchHistory[] = []
    const replaySubscription = history$.subscribe((history) => replayed.push(history))
    assert.deepEqual(replayed, [histories[2]])

    replaySubscription.unsubscribe()
    subscription.unsubscribe()
})
