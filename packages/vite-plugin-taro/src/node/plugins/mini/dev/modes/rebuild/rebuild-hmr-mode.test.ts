import assert from 'node:assert/strict'
import test from 'node:test'
import type { RuntimeModulesContract } from '../../../mini-contract.ts'
import { createRebuildHmrMode } from './rebuild-hmr-mode.ts'

const modules: RuntimeModulesContract = {
    bootstrap: '/runtime/bootstrap',
    transport: '/runtime/transport',
    appShell: '/runtime/app-shell',
    appCapsule: '/runtime/app-capsule',
    componentShell: '/runtime/component-shell',
    componentCapsule: '/runtime/component-capsule',
    customWrapperShell: '/runtime/custom-wrapper-shell',
    pageShell: '/runtime/native/page.ts',
    pageCapsule: '/runtime/page-capsule',
    devtoolsHmrRuntime: '/runtime/devtools-runtime.ts',
    interpreterHmrRuntime: '/runtime/interpreter-runtime.ts'
}

test('selects complete rebuilds without patch plugins or native entry edges', () => {
    const mode = createRebuildHmrMode(modules)
    const banner = mode.createEntryBanner(new Set(['pages/home/index.js']))

    assert.equal(mode.rebuildStrategy, 'always')
    assert.equal(mode.runtimeFile, modules.devtoolsHmrRuntime)
    assert.deepEqual(mode.plugins, [])
    assert.equal('reset' in mode, false)
    assert.equal('publish' in mode, false)
    assert.equal(banner({ name: 'app.js', fileName: 'app.js' }), '')
    assert.equal(banner({ name: 'pages/home/index.js', fileName: 'pages/home/index.js' }), '')
})
