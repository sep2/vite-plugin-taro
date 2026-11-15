import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { normalizePath } from 'vite'
import { resolveVptRuntime } from '../../../utils/packages.ts'
import { createAliMiniContract } from '../../ali/plugins.ts'
import { appComponentId } from '../../client/constant.ts'
import { pageMetadataKey } from '../../page/page-metadata-key.ts'
import { createTtMiniContract } from '../../tt/plugins.ts'
import { createWxMiniContract } from '../../wx/plugins.ts'
import type { MiniContract } from '../mini-contract.ts'
import {
    miniAppCapsuleId,
    miniAppShellId,
    miniBootstrapId,
    miniComponentCapsuleId,
    miniComponentShellId,
    miniCustomWrapperShellId,
    miniPageCapsuleId,
    miniPageShellId,
    miniTransportId,
    pageCapsuleId,
    pageComponentId,
    rendererHostId,
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
    supportsPagePrerender: true,
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
        hostPath: '/runtime/host.ts',
        env: 'synthetic',
        componentsReactPath: '/runtime/components-react.ts',
        targetRuntimePath: '/runtime/target.ts'
    }
} satisfies Pick<MiniContract, 'options' | 'taro' | 'supportsPagePrerender'>

test('resolves fixed and route-specific private IDs', () => {
    const resolver = createResolver(contract, contract.options.pages)
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
        'custom-wrapper.js': modules.customWrapperShell
    })
    assert.deepEqual(resolver.resolveId(miniTransportId, modules.bootstrap, projectRoot), {
        id: './vpt-transport.js',
        external: true
    })
    assert.equal(resolver.resolveId(rendererHostId, undefined, projectRoot), contract.taro.hostPath)
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

for (const [target, createContract] of [
    ['wx', createWxMiniContract],
    ['zfb', createAliMiniContract],
    ['tt', createTtMiniContract]
] as const) {
    test(`${target}: resolves the selected target host for every renderer configuration`, () => {
        for (const selection of [{}, { renderer: 'template' }, { renderer: 'dom' }] as const) {
            const targetContract = createContract({ ...contract.options, target, ...selection })
            const resolver = createResolver(targetContract, contract.options.pages)

            assert.equal(
                resolver.resolveId(rendererHostId, undefined, path.resolve('/project')),
                resolveVptRuntime(
                    target !== 'zfb' && targetContract.options.renderer === 'dom'
                        ? `${target}/renderer-host`
                        : 'mini/template/template-host'
                )
            )
        }
    })
}

test('resolves custom renderer hosts independently of App/Page entries', () => {
    const targetContract = createTtMiniContract({ ...contract.options, target: 'tt', renderer: 'dom' })
    const resolver = createResolver(targetContract, contract.options.pages)

    const customHostResolver = createResolver(
        { ...targetContract, taro: { ...targetContract.taro, hostPath: '/runtime/custom-host.ts' } },
        contract.options.pages
    )
    assert.equal(
        customHostResolver.resolveId(rendererHostId, undefined, path.resolve('/project')),
        '/runtime/custom-host.ts'
    )
    assert.deepEqual(resolver.entries, customHostResolver.entries)
    assert.deepEqual(resolver.input, customHostResolver.input)
})

test('preserves resolved Page order alongside fixed native inputs', () => {
    const pages = [
        Object.freeze({ path: 'pages/z-last/index', config: { title: 'First' } }),
        Object.freeze({ path: 'features/account/pages/a-first/index' })
    ]
    Object.freeze(pages)
    const input = Object.freeze({ ...contract, options: Object.freeze({ ...contract.options }) })
    const resolver = createResolver(input, pages)

    assert.equal(resolver.pages, pages)
    assert.equal(resolver.pages[0], pages[0])
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
    assert.equal(resolver.input[appEntries.capsuleName], appEntries.capsuleId)
    assert.equal(resolver.input[appEntries.shellName], appEntries.shellId)
    assert.deepEqual(resolver.input, createResolver(input, []).input)
})

test('retains App entries with an empty resolved Page list', () => {
    const resolver = createResolver(contract, [])

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

for (const supportsPagePrerender of [false, true]) {
    test(`applies the fixed contract's prerender capability (${supportsPagePrerender}) to resolved pages`, () => {
        const page = Object.freeze({ path: 'pages/compiled/index', prerender: true })
        const fixedContract = Object.freeze({
            ...contract,
            options: Object.freeze({ ...contract.options, pages: [page] }),
            supportsPagePrerender
        })
        const resolver = createResolver(fixedContract, [page])
        const result = resolver.specialize(
            'const options = __VPT_PAGE_OPTIONS__',
            `${modules.pageCapsule}?route=${encodeURIComponent(page.path)}`,
            false
        )
        assert.ok(result)
        const options: unknown = Function(`${result.code}; return options`)()
        assert.deepEqual(options, { path: page.path, prerender: supportsPagePrerender })
        assert.equal(page.prerender, true)
    })
}

test('rejects Page-private imports without one configured route origin', () => {
    const resolver = createResolver(contract, contract.options.pages)
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

test('specializes the App capsule with the configured App JSON', () => {
    const resolver = createResolver(contract, contract.options.pages)
    const result = resolver.specialize('export default __VPT_APP_CONFIG__', modules.appCapsule)

    assert.ok(result && 'meta' in result)
    assert.equal(result.meta[pageMetadataKey], resolver.pages)
    assert.match(result.code, /"pages":\s*\[\s*["']pages\/home\/index["']/)
    assert.doesNotMatch(result.code, /stale\/page/)
    assert.match(result.code, /"navigationBarTitleText":\s*["']Example["']/)
})
