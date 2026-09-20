import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { packageRequire } from '../../../utils/packages.ts'
import type { RuntimeModulesContract } from '../mini-contract.ts'
import {
    createMiniModuleClassifier,
    isMiniPolyfillModule,
    miniPolyfillsId,
    rolldownRuntimeId,
    vptGlobalBindingId
} from './module.ts'

const modules: RuntimeModulesContract = {
    bootstrap: '/runtime/bootstrap',
    appShell: '/runtime/app-shell',
    appCapsule: '/runtime/app-capsule',
    componentShell: '/runtime/component-shell',
    componentCapsule: '/runtime/component-capsule',
    customWrapperShell: '/runtime/custom-wrapper-shell',
    pageShell: '/runtime/page-shell',
    pageCapsule: '/runtime/page-capsule',
    devtoolsHmrRuntime: '/runtime/devtools-hmr',
    interpreterHmrRuntime: '/runtime/interpreter-hmr'
}

const classifyModule = createMiniModuleClassifier(modules)

function chunk(...moduleIds: string[]): Rolldown.PreRenderedChunk {
    return { moduleIds } as Rolldown.PreRenderedChunk
}

test('identifies shell and capsule entry roles independently from output execution', () => {
    assert.equal(classifyModule(chunk(modules.appShell)).entryRole, 'shell')
    assert.equal(classifyModule(chunk(modules.appCapsule)).entryRole, 'capsule')
    assert.equal(classifyModule(chunk(modules.customWrapperShell)).entryRole, 'shell')
    assert.equal(classifyModule(chunk(`${modules.pageCapsule}?route=page`)).entryRole, 'capsule')
    assert.equal(classifyModule(chunk('/application')).entryRole, undefined)
    assert.throws(() => classifyModule(chunk(modules.appShell, modules.appCapsule)), /mixes shell and capsule entries/)
})

test('classifies native, capsule and amphibious execution in one pass', () => {
    assert.deepEqual(classifyModule(chunk('/application')), {
        entryRole: undefined,
        executionKind: 'capsule'
    })
    assert.equal(classifyModule(chunk(modules.appShell)).executionKind, 'native')
    assert.equal(classifyModule(chunk(modules.appCapsule)).executionKind, 'capsule')
    assert.equal(classifyModule(chunk(modules.bootstrap)).executionKind, 'amphibious')
    assert.equal(classifyModule(chunk(vptGlobalBindingId)).executionKind, 'amphibious')
    assert.equal(classifyModule(chunk(vptGlobalBindingId, rolldownRuntimeId)).executionKind, 'amphibious')
    assert.equal(classifyModule(chunk(rolldownRuntimeId)).executionKind, 'amphibious')
    assert.equal(classifyModule(chunk(modules.appCapsule, rolldownRuntimeId)).executionKind, 'amphibious')
})

test('framework vendor remains a capsule regardless of its output name', () => {
    for (const moduleId of [
        packageRequire.resolve('vite-plugin-taro-runtime/runtime/mini'),
        packageRequire.resolve('react'),
        packageRequire.resolve('react-dom')
    ]) {
        assert.deepEqual(classifyModule({ ...chunk(moduleId), name: 'renamed-framework' }), {
            entryRole: undefined,
            executionKind: 'capsule'
        })
    }
    assert.equal(classifyModule({ ...chunk('/repo/src/vendor.ts'), name: 'vendor' }).executionKind, 'capsule')
})

test('polyfill execution follows the virtual entry while package paths only control grouping', () => {
    assert.equal(isMiniPolyfillModule(miniPolyfillsId), true)
    assert.equal(isMiniPolyfillModule(vptGlobalBindingId), true)
    assert.equal(classifyModule({ ...chunk(miniPolyfillsId), name: 'renamed-polyfills' }).executionKind, 'amphibious')
    for (const moduleId of [
        packageRequire.resolve('core-js/modules/web.url.js'),
        packageRequire.resolve('core-js/internals/global-this.js')
    ]) {
        assert.equal(isMiniPolyfillModule(moduleId), true)
        assert.equal(classifyModule(chunk(moduleId)).executionKind, 'capsule')
        assert.equal(classifyModule(chunk(miniPolyfillsId, moduleId)).executionKind, 'amphibious')
    }
    assert.equal(isMiniPolyfillModule('/repo/src/polyfills.ts'), false)
    assert.equal(classifyModule({ ...chunk('/repo/src/polyfills.ts'), name: 'polyfills' }).executionKind, 'capsule')
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
        const classifyFixture = fixtureModule.createMiniModuleClassifier(modules)
        for (const [name, packageRoot] of Object.entries(packageRoots)) {
            const moduleId = path.join(packageRoot, 'index.js')
            assert.equal(fixtureModule.isMiniFrameworkVendorModule(moduleId), name !== 'core-js')
            assert.equal(fixtureModule.isMiniPolyfillModule(moduleId), name === 'core-js')
            assert.equal(classifyFixture(chunk(moduleId)).executionKind, 'capsule')
            assert.equal(fixtureModule.isMiniFrameworkVendorModule(`${packageRoot}-other/index.js`), false)
            assert.equal(fixtureModule.isMiniPolyfillModule(`${packageRoot}-other/index.js`), false)
        }
        assert.equal(fixtureModule.miniRuntimeId, path.join(runtimeRoot, 'dist/runtime/index.js'))
        assert.equal(fixtureModule.isMiniFrameworkVendorModule(path.join(root, 'src/react.ts')), false)
    })
}
