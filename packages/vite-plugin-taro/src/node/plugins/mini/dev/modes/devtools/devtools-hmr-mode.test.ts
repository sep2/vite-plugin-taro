import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import type { RuntimeModulesContract } from '../../../mini-contract.ts'
import type { PatchUpdate } from '../../hmr-protocol.ts'
import {
    createDevtoolsHmrMode,
    devtoolsPatchesFileName,
    injectPageShellHmr,
    renderDevtoolsPatches,
    renderInitialDevtoolsPatches
} from './devtools-hmr-mode.ts'

const modules: RuntimeModulesContract = {
    bootstrap: '/runtime/bootstrap',
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

const patch: PatchUpdate = {
    type: 'Patch',
    code: 'registerLatestFactory()',
    filename: 'pages/index.js',
    changedIds: ['src/page.tsx'],
    seq: 1
}

test('creates exact App and Page entry banners', () => {
    const mode = createDevtoolsHmrMode(modules)
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
    assert.equal(mode.runtimeFile, modules.devtoolsHmrRuntime)
})

test('creates fresh Page plugins with exact shell identity filtering', async () => {
    const first = createDevtoolsHmrMode(modules).plugins[0]
    const second = createDevtoolsHmrMode(modules).plugins[0]
    assert.ok(first)
    assert.ok(second)
    assert.notStrictEqual(first, second)
    assert.equal(first.name, 'vpt:mini-page-shell-hmr')

    const transformHook = first.transform
    assert.ok(transformHook && typeof transformHook === 'object')
    const idFilter = transformHook.filter?.id
    assert.ok(idFilter instanceof RegExp)
    assert.equal(idFilter.test(modules.pageShell), true)
    assert.equal(idFilter.test(`${modules.pageShell}?other`), true)
    assert.equal(idFilter.test(`${modules.pageShell}.copy`), false)
    assert.equal(idFilter.test(modules.pageShell.replace('.ts', 'Xts')), false)
    assert.equal(idFilter.test('/project/runtime/native/page.ts'), false)

    const transformed = await Reflect.apply(transformHook.handler, {}, ['Page(pageConfig)', modules.pageShell])
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

test('native patch wrappers capture the supplied runtime without looking up a host binding', () => {
    const code = `
        __rolldown_runtime__.registerFactory(() => __rolldown_runtime__);
        // The patch body, including this spelling in text, is never rewritten.
        const marker = '__rolldown_runtime__';
    `
    const source = renderDevtoolsPatches('build', [{ ...patch, code }])
    assert.ok(source.includes(code))
    const module: { exports: unknown } = { exports: undefined }
    const context = { module }
    Object.defineProperty(context, '__rolldown_runtime__', {
        get() {
            assert.fail('Patch execution must not read the host runtime binding')
        }
    })
    runInNewContext(`"use strict";\n${source}`, context, { contextCodeGeneration: { strings: false, wasm: false } })
    const payload = module.exports
    assert.ok(payload && typeof payload === 'object' && 'patches' in payload && Array.isArray(payload.patches))
    const factory: unknown = payload.patches[0].factory
    assert.ok(typeof factory === 'function')
    // The same inert payload may be installed by separate runtime instances; closures must retain each call's own parameter.
    const closures: Array<() => unknown> = []
    const runtimes = [0, 1].map(() => ({
        registerFactory(closure: () => unknown) {
            closures.push(closure)
        }
    }))
    for (const runtime of runtimes) {
        factory(runtime)
    }
    assert.equal(closures.length, 2)
    assert.strictEqual(closures[0](), runtimes[0])
    assert.strictEqual(closures[1](), runtimes[1])
})

test('rejects an empty cumulative patch range', () => {
    assert.throws(() => renderDevtoolsPatches('build', []), /Cannot render an empty Mini Program patch range/)
})

test('describes reset and publication writes through the exact DevTools patch path', () => {
    const mode = createDevtoolsHmrMode(modules)
    const resetMode = mode.reset
    const publishMode = mode.publish
    assert.ok(resetMode)
    assert.ok(publishMode)
    const reset = resetMode()
    const publication = publishMode({ buildId: 'build', patches: [patch] })

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
