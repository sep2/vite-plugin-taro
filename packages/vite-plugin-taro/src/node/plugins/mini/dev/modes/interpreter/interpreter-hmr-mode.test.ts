import assert from 'node:assert/strict'
import test from 'node:test'
import { interpreterServerEvent } from '../../../../../../runtime/mini/dev/modes/interpreter/interpreter-protocol.ts'
import type { PatchPublication, PatchUpdate } from '../../hmr-protocol.ts'
import { createInterpreterHmrMode } from './interpreter-hmr-mode.ts'

const runtimeFile = '/runtime/interpreter-runtime.ts'

const patch: PatchUpdate = {
    type: 'Patch',
    code: '__rolldown_runtime__.registerFactory("feature", "esm", factory)',
    filename: 'feature.js',
    changedIds: ['feature'],
    seq: 1
}

test('initializes only the App entry and installs no Page transform', () => {
    const mode = createInterpreterHmrMode(runtimeFile)
    const banner = mode.createEntryBanner(new Set(['pages/home/index.js']))

    assert.equal(
        banner({ name: 'app.js', fileName: 'app.js' }),
        "__rolldown_runtime__.initialize(require('./hmr/info.js'));\n"
    )
    assert.equal(banner({ name: 'pages/home/index.js', fileName: 'pages/home/index.js' }), '')
    assert.deepEqual(mode.plugins, [])
    assert.equal(mode.runtimeFile, runtimeFile)
})

test('describes publication events without owning their transport', () => {
    const mode = createInterpreterHmrMode(runtimeFile)
    const publication: PatchPublication = { buildId: 'build', patches: [patch] }
    const publish = mode.publish

    assert.equal('reset' in mode, false)
    assert.ok(publish)
    assert.deepEqual(publish(publication), {
        kind: 'event',
        event: interpreterServerEvent,
        data: { kind: 'patches', buildId: 'build', patches: [patch] }
    })
})
