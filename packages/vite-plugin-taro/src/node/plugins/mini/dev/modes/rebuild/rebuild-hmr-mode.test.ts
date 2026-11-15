import assert from 'node:assert/strict'
import test from 'node:test'
import { miniAppShellId, miniPageShellId } from '../../../module/module.ts'
import { createRebuildHmrMode } from './rebuild-hmr-mode.ts'

const runtimeFile = '/runtime/devtools-runtime.ts'

test('selects complete rebuilds without patch plugins or native entry edges', () => {
    const mode = createRebuildHmrMode(runtimeFile)
    const banner = mode.entryBanner

    assert.equal(mode.rebuildStrategy, 'always')
    assert.equal(mode.runtimeFile, runtimeFile)
    assert.deepEqual(mode.plugins, [])
    assert.equal('reset' in mode, false)
    assert.equal('publish' in mode, false)
    assert.equal(banner({ facadeModuleId: miniAppShellId, fileName: 'app.js' }), '')
    assert.equal(banner({ facadeModuleId: miniPageShellId, fileName: 'pages/home/index.js' }), '')
})
