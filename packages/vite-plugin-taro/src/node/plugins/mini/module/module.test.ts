import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { packageRequire } from '../../../utils/packages.ts'
import {
    classifyMiniModule,
    isMiniPolyfillModule,
    miniAppCapsuleId,
    miniAppShellId,
    miniBootstrapId,
    miniComponentCapsuleId,
    miniComponentShellId,
    miniCustomWrapperShellId,
    miniPageCapsuleId,
    miniPageShellId,
    miniPolyfillsId,
    miniTaroRuntimeId,
    rolldownRuntimeId,
    vptGlobalBindingId
} from './module.ts'

const classifyModule = classifyMiniModule

function chunk(...moduleIds: string[]): Rolldown.PreRenderedChunk {
    return {
        name: 'fixture',
        isEntry: false,
        isDynamicEntry: false,
        facadeModuleId: null,
        moduleIds,
        exports: []
    }
}

test('classifies native lifecycle shells and entry capsules by module identity', () => {
    for (const moduleId of [miniAppShellId, miniPageShellId, miniComponentShellId, miniCustomWrapperShellId]) {
        assert.equal(classifyModule(chunk('/dependency', moduleId)), 'native')
    }
    for (const moduleId of [miniAppCapsuleId, miniPageCapsuleId, miniComponentCapsuleId]) {
        assert.equal(classifyModule(chunk('/dependency', moduleId)), 'entry-capsule')
    }
})

test('recognizes route-qualified lifecycle entries', () => {
    assert.equal(classifyModule(chunk(`${miniPageShellId}?route=pages%2Fhome`)), 'native')
    assert.equal(classifyModule(chunk(`${miniPageCapsuleId}?route=pages%2Fhome`)), 'entry-capsule')
})

test('classifies application-only and empty chunks as normal capsules', () => {
    assert.equal(classifyModule(chunk('/application', '/dependency')), 'normal-capsule')
    assert.equal(classifyModule(chunk()), 'normal-capsule')
})

test('classifies standalone and grouped infrastructure as amphibious', () => {
    for (const moduleId of [miniBootstrapId, vptGlobalBindingId, miniPolyfillsId, rolldownRuntimeId]) {
        assert.equal(classifyModule(chunk('/dependency', moduleId)), 'amphibious')
    }
    // Classification depends on module identities, not whether Rolldown keeps infrastructure in separate chunks.
    assert.equal(classifyModule(chunk(rolldownRuntimeId, vptGlobalBindingId, miniPolyfillsId)), 'amphibious')
    assert.equal(classifyModule(chunk(miniPolyfillsId, vptGlobalBindingId, rolldownRuntimeId)), 'amphibious')
})

test('framework vendor remains a normal capsule regardless of its output name', () => {
    for (const moduleId of [miniTaroRuntimeId, packageRequire.resolve('react'), packageRequire.resolve('react-dom')]) {
        assert.equal(classifyModule({ ...chunk(moduleId), name: 'renamed-framework' }), 'normal-capsule')
    }
    assert.equal(classifyModule({ ...chunk('/repo/src/vendor.ts'), name: 'vendor' }), 'normal-capsule')
})

test('polyfill execution follows the virtual entry while package paths only control grouping', () => {
    assert.equal(isMiniPolyfillModule(miniPolyfillsId), true)
    assert.equal(isMiniPolyfillModule(vptGlobalBindingId), true)
    assert.equal(isMiniPolyfillModule(rolldownRuntimeId), false)
    assert.equal(classifyModule({ ...chunk(miniPolyfillsId), name: 'renamed-polyfills' }), 'amphibious')
    for (const moduleId of [
        packageRequire.resolve('core-js/modules/web.url.js'),
        packageRequire.resolve('core-js/internals/global-this.js')
    ]) {
        assert.equal(isMiniPolyfillModule(moduleId), true)
        assert.equal(classifyModule(chunk(moduleId)), 'normal-capsule')
        assert.equal(classifyModule(chunk(miniPolyfillsId, moduleId)), 'amphibious')
    }
    assert.equal(isMiniPolyfillModule('/repo/src/polyfills.ts'), false)
    assert.equal(classifyModule({ ...chunk('/repo/src/polyfills.ts'), name: 'polyfills' }), 'normal-capsule')
})

for (const layout of ['installed', 'linked'] as const) {
    test(`framework and polyfill roots follow Node resolution in the ${layout} package layout`, async (context) => {
        const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-framework-roots-')))
        context.after(() => rm(root, { recursive: true, force: true }))
        const runtimeRoot = path.join(
            root,
            layout === 'installed' ? 'node_modules/vite-plugin-taro-runtime' : 'renamed-runtime-source'
        )
        const polyfillRoot = path.join(
            root,
            layout === 'installed' ? 'node_modules/core-js' : 'renamed-polyfill-source'
        )
        const packageRoots = {
            'vite-plugin-taro-runtime': runtimeRoot,
            react: path.join(root, 'node_modules/react'),
            'react-dom': path.join(root, 'node_modules/react-dom'),
            'core-js': polyfillRoot
        }
        for (const [name, packageRoot] of Object.entries(packageRoots)) {
            await mkdir(packageRoot, { recursive: true })
            await writeFile(
                path.join(packageRoot, 'package.json'),
                JSON.stringify({
                    name,
                    main: 'index.js',
                    ...(name === 'vite-plugin-taro-runtime'
                        ? { exports: { './runtime/mini': './dist/runtime/index.js' } }
                        : {})
                })
            )
            await writeFile(path.join(packageRoot, 'index.js'), '')
        }
        await mkdir(path.join(runtimeRoot, 'dist/runtime'), { recursive: true })
        await writeFile(path.join(runtimeRoot, 'dist/runtime/index.js'), '')
        if (layout === 'linked') {
            await symlink(runtimeRoot, path.join(root, 'node_modules/vite-plugin-taro-runtime'), 'junction')
            await symlink(polyfillRoot, path.join(root, 'node_modules/core-js'), 'junction')
        }

        const fixtureRequire = createRequire(path.join(root, 'consumer.js'))
        // Re-evaluate only the module table against this fixture's resolver; no production configuration hook is added for tests.
        context.mock.method(packageRequire, 'resolve', fixtureRequire.resolve)
        const fixtureModule: typeof import('./module.ts') = await import(
            new URL(`./module.ts?layout=${layout}`, import.meta.url).href
        )
        const classifyFixture = fixtureModule.classifyMiniModule
        for (const [name, packageRoot] of Object.entries(packageRoots)) {
            const moduleId = path.join(packageRoot, 'index.js')
            assert.equal(fixtureModule.isMiniFrameworkVendorModule(moduleId), name !== 'core-js')
            assert.equal(fixtureModule.isMiniPolyfillModule(moduleId), name === 'core-js')
            assert.equal(classifyFixture(chunk(moduleId)), 'normal-capsule')
            assert.equal(fixtureModule.isMiniFrameworkVendorModule(`${packageRoot}-other/index.js`), false)
            assert.equal(fixtureModule.isMiniPolyfillModule(`${packageRoot}-other/index.js`), false)
        }
        assert.equal(fixtureModule.miniTaroRuntimeId, path.join(runtimeRoot, 'dist/runtime/index.js'))
        assert.equal(fixtureModule.isMiniFrameworkVendorModule(path.join(root, 'src/react.ts')), false)
    })
}
