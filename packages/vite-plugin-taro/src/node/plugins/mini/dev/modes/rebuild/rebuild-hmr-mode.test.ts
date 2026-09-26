import assert from 'node:assert/strict'
import test from 'node:test'
import { createRebuildHmrMode } from './rebuild-hmr-mode.ts'

const runtimeFile = '/runtime/devtools-runtime.ts'

test('selects complete rebuilds without patch plugins or native entry edges', () => {
    const mode = createRebuildHmrMode(runtimeFile)
    const banner = mode.createEntryBanner(new Set(['pages/home/index.js']))

    assert.equal(mode.rebuildStrategy, 'always')
    assert.equal(mode.runtimeFile, runtimeFile)
    assert.deepEqual(mode.plugins, [])
    assert.equal('reset' in mode, false)
    assert.equal('publish' in mode, false)
    assert.equal(banner({ name: 'app.js', fileName: 'app.js' }), '')
    assert.equal(banner({ name: 'pages/home/index.js', fileName: 'pages/home/index.js' }), '')
})
