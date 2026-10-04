import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { normalizePath } from 'vite'
import { resolveVptRuntime } from '../../../utils/packages.ts'
import { appComponentId } from '../../client/constant.ts'
import type { MiniContract } from '../mini-contract.ts'
import {
    miniAppCapsuleId,
    miniAppShellId,
    miniBootstrapId,
    miniComponentCapsuleId,
    miniComponentShellId,
    miniCustomWrapperShellId,
    miniPageCapsuleId,
    miniPageConstructorId,
    miniPageConstructorRuntimeId,
    miniPageShellId,
    miniTransportId,
    pageCapsuleId,
    pageComponentId,
    taroTargetRuntimeId,
    vitePreloadId
} from '../module/module.ts'
import { createResolver } from './resolver.ts'

const modules = {
    bootstrap: miniBootstrapId,
    appShell: miniAppShellId,
    appCapsule: miniAppCapsuleId,
    componentShell: miniComponentShellId,
    componentCapsule: miniComponentCapsuleId,
    customWrapperShell: miniCustomWrapperShellId,
    pageShell: miniPageShellId,
    pageCapsule: miniPageCapsuleId
}

const contract = {
    options: {
        target: 'wx',
        app: 'src/app.tsx',
        pages: [
            {
                path: 'pages/home/index',
                config: {
                    navigationBarTitleText: 'Home'
                }
            }
        ],
        appJson: {
            pages: ['stale/page'],
            window: {
                navigationBarTitleText: 'Example'
            }
        },
        projectConfigJson: {}
    },
    taro: {
        env: 'synthetic',
        componentsReactPath: '/runtime/components-react.ts',
        targetRuntimePath: '/runtime/target.ts'
    },
    runtime: {
        pageShell: miniPageShellId,
        pageConstructor: miniPageConstructorRuntimeId,
        devtoolsHmrRuntime: '/runtime/devtools.ts',
        interpreterHmrRuntime: '/runtime/interpreter.ts'
    }
} satisfies Pick<MiniContract, 'options' | 'taro' | 'runtime'>

test('resolves fixed and route-specific private IDs', () => {
    const resolver = createResolver(contract)
    const projectRoot = path.resolve('/project')

    assert.deepEqual(resolver.entries, {
        appEntries: {
            capsuleId: modules.appCapsule,
            capsuleName: 'app-capsule',
            shellId: modules.appShell,
            shellName: 'app.js'
        },
        pageEntries: [
            {
                capsuleId: `${modules.pageCapsule}?route=pages%2Fhome%2Findex`,
                capsuleName: 'pages/home/index-capsule',
                shellId: `${modules.pageShell}?route=pages%2Fhome%2Findex`,
                shellName: 'pages/home/index.js'
            }
        ]
    })
    assert.deepEqual(resolver.input, {
        'app.js': modules.appShell,
        'comp.js': modules.componentShell,
        bootstrap: modules.bootstrap,
        'app-capsule': modules.appCapsule,
        'component-capsule': modules.componentCapsule,
        'custom-wrapper.js': modules.customWrapperShell,
        'pages/home/index.js': `${modules.pageShell}?route=pages%2Fhome%2Findex`,
        'pages/home/index-capsule': `${modules.pageCapsule}?route=pages%2Fhome%2Findex`
    })
    assert.deepEqual(resolver.resolveId(miniTransportId, modules.bootstrap, projectRoot), {
        id: './vpt/transport.js',
        external: true
    })
    assert.equal(resolver.resolveId(vitePreloadId, undefined, projectRoot), modules.bootstrap)
    assert.equal(resolver.resolveId(taroTargetRuntimeId, undefined, projectRoot), contract.taro.targetRuntimePath)
    assert.equal(
        resolver.resolveId(appComponentId, undefined, projectRoot),
        normalizePath(path.resolve(projectRoot, 'src/app.tsx'))
    )

    const pageCapsule = resolver.resolveId(pageCapsuleId, '/runtime/page.js?route=pages%2Fhome%2Findex', projectRoot)
    assert.equal(pageCapsule, `${modules.pageCapsule}?route=pages%2Fhome%2Findex`)
    assert.equal(
        resolver.resolveId(pageComponentId, pageCapsule, projectRoot),
        normalizePath(path.resolve(projectRoot, 'src/pages/home/index.tsx'))
    )
})

test('selects the constructor through the private import without changing the shared shell or capsule', () => {
    for (const pageConstructor of [miniPageConstructorRuntimeId, resolveVptRuntime('wx/native/wx-page-constructor')]) {
        const resolver = createResolver({ ...contract, runtime: { ...contract.runtime, pageConstructor } })
        const shellId = `${miniPageShellId}?route=pages%2Fhome%2Findex`
        assert.equal(resolver.resolveId(miniPageConstructorId, shellId, path.resolve('/project')), pageConstructor)
        assert.equal(resolver.entries.pageEntries[0]?.shellId, shellId)
        assert.equal(resolver.input['pages/home/index.js'], shellId)
        assert.equal(resolver.entries.pageEntries[0]?.capsuleId, `${miniPageCapsuleId}?route=pages%2Fhome%2Findex`)
    }
})

test('takes route-qualified Page entries from the runtime contract', () => {
    const pageShell = '/runtime/selected-page.ts'
    const resolver = createResolver({ ...contract, runtime: { ...contract.runtime, pageShell } })
    const shellId = `${pageShell}?route=pages%2Fhome%2Findex`
    const capsuleId = `${miniPageCapsuleId}?route=pages%2Fhome%2Findex`
    assert.equal(resolver.entries.pageEntries[0]?.shellId, shellId)
    assert.equal(resolver.input['pages/home/index.js'], shellId)
    assert.equal(resolver.resolveId(pageCapsuleId, shellId, '/project'), capsuleId)
})

test('preserves configured Page order and reuses App/Page entries in the native input map', () => {
    const resolver = createResolver({
        ...contract,
        options: {
            ...contract.options,
            pages: [{ path: 'pages/z-last/index' }, { path: 'features/account/pages/a-first/index' }]
        }
    })

    const { appEntries, pageEntries } = resolver.entries
    assert.deepEqual(pageEntries, [
        {
            capsuleId: `${modules.pageCapsule}?route=pages%2Fz-last%2Findex`,
            capsuleName: 'pages/z-last/index-capsule',
            shellId: `${modules.pageShell}?route=pages%2Fz-last%2Findex`,
            shellName: 'pages/z-last/index.js'
        },
        {
            capsuleId: `${modules.pageCapsule}?route=features%2Faccount%2Fpages%2Fa-first%2Findex`,
            capsuleName: 'features/account/pages/a-first/index-capsule',
            shellId: `${modules.pageShell}?route=features%2Faccount%2Fpages%2Fa-first%2Findex`,
            shellName: 'features/account/pages/a-first/index.js'
        }
    ])
    for (const entry of [appEntries, ...pageEntries]) {
        assert.equal(resolver.input[entry.capsuleName], entry.capsuleId)
        assert.equal(resolver.input[entry.shellName], entry.shellId)
    }
})

test('retains App entries with no Page entries when no routes are configured', () => {
    const resolver = createResolver({ ...contract, options: { ...contract.options, pages: [] } })

    assert.deepEqual(resolver.entries, {
        appEntries: {
            capsuleId: modules.appCapsule,
            capsuleName: 'app-capsule',
            shellId: modules.appShell,
            shellName: 'app.js'
        },
        pageEntries: []
    })
    assert.deepEqual(resolver.input, {
        bootstrap: modules.bootstrap,
        'app.js': modules.appShell,
        'app-capsule': modules.appCapsule,
        'comp.js': modules.componentShell,
        'component-capsule': modules.componentCapsule,
        'custom-wrapper.js': modules.customWrapperShell
    })
})

test('rejects Page-private imports without one configured route origin', () => {
    const resolver = createResolver(contract)
    const projectRoot = path.resolve('/project')

    assert.throws(
        () => resolver.resolveId(pageCapsuleId, undefined, projectRoot),
        /Page capsule import must originate from a route module/
    )
    assert.throws(
        () => resolver.resolveId(pageCapsuleId, '/runtime/page.js?route=pages%2Fmissing%2Findex', projectRoot),
        /Unknown Page capsule: pages\/missing\/index/
    )
    assert.throws(
        () => resolver.resolveId(pageComponentId, modules.pageCapsule, projectRoot),
        /Page capsule import must originate from a route module/
    )
})

test('specializes the App capsule with the configured App JSON', async () => {
    const resolver = createResolver(contract)
    const result = await resolver.specialize('export default __VPT_APP_CONFIG__', modules.appCapsule)

    assert.ok(result)
    assert.match(result.code, /"pages":\s*\[\s*["']pages\/home\/index["']/)
    assert.doesNotMatch(result.code, /stale\/page/)
    assert.match(result.code, /"navigationBarTitleText":\s*["']Example["']/)
})
