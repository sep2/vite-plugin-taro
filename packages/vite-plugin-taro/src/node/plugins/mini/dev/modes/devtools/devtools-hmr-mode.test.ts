import assert from 'node:assert/strict'
import test from 'node:test'
import { pageShellPath } from '../../../module/module.ts'
import type { PatchUpdate } from '../../hmr-protocol.ts'
import {
    createDevtoolsHmrMode,
    devtoolsPatchesFileName,
    injectPageShellHmr,
    renderDevtoolsPatches,
    renderInitialDevtoolsPatches
} from './devtools-hmr-mode.ts'

const patch: PatchUpdate = {
    type: 'Patch',
    code: 'registerLatestFactory()',
    filename: 'pages/index.js',
    changedIds: ['src/page.tsx'],
    seq: 1
}

test('creates exact App and Page entry banners', () => {
    const mode = createDevtoolsHmrMode()
    const banner = mode.createEntryBanner(new Set(['pages/home/index.js']))

    assert.equal(
        banner({ name: 'app.js', fileName: 'app.js' }),
        "__rolldown_runtime__.initialize(require('./hmr/info.js'));\n"
    )
    assert.equal(
        banner({ name: 'pages/home/index.js', fileName: 'pages/home/index.js' }),
        "__rolldown_runtime__.applyPatches(require('../../hmr/patches.js'));\n"
    )
    assert.equal(banner({ name: 'assets/vendor.js', fileName: 'assets/vendor.js' }), '')
    assert.match(mode.runtimeFile, /wx\/dev\/modes\/devtools\/devtools-runtime\.(?:ts|js)$/)
})

test('creates fresh Page plugins with exact shell identity filtering', async () => {
    const first = createDevtoolsHmrMode().plugins[0]
    const second = createDevtoolsHmrMode().plugins[0]
    assert.ok(first)
    assert.ok(second)
    assert.notStrictEqual(first, second)
    assert.equal(first.name, 'vpt:wx-page-shell-hmr')

    const transformHook = first.transform
    assert.ok(transformHook)
    const transform = typeof transformHook === 'function' ? transformHook : transformHook.handler
    assert.equal(
        await Reflect.apply(transform, {}, ['Page(pageConfig)', '/project/runtime/wx/native/page.js?other']),
        undefined
    )

    const transformed = await Reflect.apply(transform, {}, ['Page(pageConfig)', pageShellPath])
    assert.ok(transformed && typeof transformed === 'object' && 'code' in transformed)
    assert.match(String(transformed.code), /injectPageHmr/)
})

test('injects Page HMR immediately before native registration', () => {
    const result = injectPageShellHmr("import pageConfig from 'capsule'\nPage(pageConfig)")

    assert.match(result.code, /Page\(__rolldown_runtime__\.injectPageHmr\(pageConfig\)\)$/)
    assert.equal(result.map, null)
})

test('rejects a native Page shell without the stable registration contract', () => {
    assert.throws(() => injectPageShellHmr('Page(config)'), /must register pageConfig/)
})

test('renders initial and cumulative patches as inert CommonJS data', () => {
    assert.equal(renderInitialDevtoolsPatches(), 'module.exports = undefined;\n')

    const source = renderDevtoolsPatches('build', [patch])
    assert.match(source, /^module\.exports = \{buildId: "build", patches:/)
    assert.match(source, /registerLatestFactory\(\)/)
    assert.doesNotMatch(source, /^__rolldown_runtime__/)
})

test('rejects an empty cumulative patch range', () => {
    assert.throws(() => renderDevtoolsPatches('build', []), /Cannot render an empty WX patch range/)
})

test('describes reset and publication writes through the exact DevTools patch path', () => {
    const mode = createDevtoolsHmrMode()
    const reset = mode.reset()
    const publication = mode.publish({ buildId: 'build', patches: [patch] })

    assert.equal(devtoolsPatchesFileName, 'hmr/patches.js')
    assert.deepEqual(reset, {
        kind: 'write',
        fileName: 'hmr/patches.js',
        source: 'module.exports = undefined;\n'
    })
    assert.equal(publication.kind, 'write')
    if (publication.kind !== 'write') {
        assert.fail('DevTools publication must request a physical write')
    }
    assert.equal(publication.fileName, 'hmr/patches.js')
    assert.match(publication.source, /registerLatestFactory\(\)/)
})
