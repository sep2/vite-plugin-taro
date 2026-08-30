import assert from 'node:assert/strict'
import test from 'node:test'
import { interpreterServerEvent } from '../../../../../../runtime/wx/dev/modes/interpreter/interpreter-protocol.ts'
import { runtimeControlEvent } from '../../../../../../runtime/wx/dev/wx-hmr-protocol.ts'
import type { PatchPublication, PatchUpdate } from '../../hmr-protocol.ts'
import { createInterpreterHmrMode } from './interpreter-hmr-mode.ts'

const patch: PatchUpdate = {
    type: 'Patch',
    code: '__rolldown_runtime__.registerFactory("feature", "esm", factory)',
    filename: 'feature.js',
    changedIds: ['feature'],
    seq: 1
}

test('initializes only the App entry and installs no Page transform', () => {
    const mode = createInterpreterHmrMode()
    const banner = mode.createEntryBanner(new Set(['pages/home/index.js']))

    assert.equal(
        banner({ name: 'app.js', fileName: 'app.js' }),
        "__rolldown_runtime__.initialize(require('./hmr/info.js'));\n"
    )
    assert.equal(banner({ name: 'pages/home/index.js', fileName: 'pages/home/index.js' }), '')
    assert.deepEqual(mode.plugins, [])
    assert.match(mode.runtimeFile, /wx\/dev\/modes\/interpreter\/interpreter-runtime\.(?:ts|js)$/)
})

test('describes publication and initial-subscription events without owning their transport', () => {
    const mode = createInterpreterHmrMode()
    const current: PatchPublication = { buildId: 'build', patches: [patch] }
    const empty: PatchPublication = { buildId: 'build', patches: [] }

    assert.equal(mode.reset(), undefined)
    assert.deepEqual(mode.publish(current), {
        kind: 'event',
        event: interpreterServerEvent,
        data: { kind: 'patches', buildId: 'build', patches: [patch] }
    })

    assert.equal(mode.replay(undefined, 'build'), undefined)
    assert.equal(mode.replay(empty, 'build'), undefined)
    assert.deepEqual(mode.replay(current, 'stale-build'), {
        kind: 'event',
        event: runtimeControlEvent,
        data: { kind: 'close', reason: 'build replaced' }
    })
    assert.deepEqual(mode.replay(current, 'build'), {
        kind: 'event',
        event: interpreterServerEvent,
        data: { kind: 'patches', buildId: 'build', patches: [patch] }
    })
})
