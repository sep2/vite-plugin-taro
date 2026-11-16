import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { normalizePath } from 'vite'
import type { VptPageOption } from '../../../../options.ts'
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

test('resolves fixed IDs immediately and Page IDs after setPages', () => {
    const resolver = createResolver(contract)
    const projectRoot = path.resolve('/project')

    assert.deepEqual(resolver.appEntry, {
        capsuleId: modules.appCapsule,
        capsuleName: 'app-capsule',
        shellId: modules.appShell,
        shellName: 'app.js'
    })
    assert.deepEqual(resolver.pageEntries(), [])
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

    resolver.setPages(contract.options.pages)
    assert.deepEqual(resolver.pageEntries(), [
        {
            page: contract.options.pages[0],
            capsuleId: `${modules.pageCapsule}?route=pages%2Fhome%2Findex`,
            capsuleName: 'pages/home/index-capsule',
            shellId: `${modules.pageShell}?route=pages%2Fhome%2Findex`,
            shellName: 'pages/home/index.js'
        }
    ])
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
            const resolver = createResolver(targetContract)

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
    const resolver = createResolver(targetContract)

    const customHostResolver = createResolver({
        ...targetContract,
        taro: { ...targetContract.taro, hostPath: '/runtime/custom-host.ts' }
    })
    assert.equal(
        customHostResolver.resolveId(rendererHostId, undefined, path.resolve('/project')),
        '/runtime/custom-host.ts'
    )
    assert.deepEqual(resolver.appEntry, customHostResolver.appEntry)
    resolver.setPages(contract.options.pages)
    customHostResolver.setPages(contract.options.pages)
    assert.deepEqual(resolver.pageEntries(), customHostResolver.pageEntries())
})

test('preserves resolved Page order in the App-owned entries', () => {
    const pages = [
        Object.freeze({ path: 'pages/z-last/index', config: { title: 'First' } }),
        Object.freeze({ path: 'features/account/pages/a-first/index' })
    ]
    Object.freeze(pages)
    const input = Object.freeze({ ...contract, options: Object.freeze({ ...contract.options }) })
    const resolver = createResolver(input)
    resolver.setPages(pages)

    const { appEntry } = resolver
    const pageEntries = resolver.pageEntries()
    for (const [index, page] of pages.entries()) {
        assert.strictEqual(pageEntries[index]!.page, page)
    }
    assert.deepEqual(pageEntries, [
        {
            page: pages[0],
            capsuleId: `${modules.pageCapsule}?route=pages%2Fz-last%2Findex`,
            capsuleName: 'pages/z-last/index-capsule',
            shellId: `${modules.pageShell}?route=pages%2Fz-last%2Findex`,
            shellName: 'pages/z-last/index.js'
        },
        {
            page: pages[1],
            capsuleId: `${modules.pageCapsule}?route=features%2Faccount%2Fpages%2Fa-first%2Findex`,
            capsuleName: 'features/account/pages/a-first/index-capsule',
            shellId: `${modules.pageShell}?route=features%2Faccount%2Fpages%2Fa-first%2Findex`,
            shellName: 'features/account/pages/a-first/index.js'
        }
    ])
    assert.deepEqual(appEntry, createResolver(input).appEntry)
})

test('retains App entries with an empty resolved Page list', () => {
    const resolver = createResolver(contract)

    assert.deepEqual(resolver.appEntry, {
        capsuleId: modules.appCapsule,
        capsuleName: 'app-capsule',
        shellId: modules.appShell,
        shellName: 'app.js'
    })
    assert.deepEqual(resolver.pageEntries(), [])
})

test('setPages updates entries, route resolution and capsule metadata together', () => {
    const resolver = createResolver(contract)
    const { appEntry, resolveId, specialize } = resolver
    const projectRoot = path.resolve('/project')
    const generations: readonly (readonly VptPageOption[])[] = [
        [{ path: 'pages/home/index', config: { title: 'Home' }, prerender: true }, { path: 'pages/detail/index' }],
        [{ path: 'pages/new/index' }, { path: 'pages/home/index', config: { title: 'Updated home' } }],
        []
    ]

    for (const pages of generations) {
        const previousEntries = resolver.pageEntries()
        pages.forEach(Object.freeze)
        resolver.setPages(Object.freeze(pages))
        assert.equal(resolver.appEntry, appEntry)
        assert.equal(resolver.resolveId, resolveId)
        assert.equal(resolver.specialize, specialize)
        assert.deepEqual(
            resolver.pageEntries().map((entry) => entry.page),
            pages
        )
        for (const [index, entry] of resolver.pageEntries().entries()) {
            assert.equal(entry.page, pages[index])
            assert.equal(resolveId(pageCapsuleId, entry.shellId, projectRoot), entry.capsuleId)
            assert.equal(
                resolveId(pageComponentId, entry.capsuleId, projectRoot),
                normalizePath(path.resolve(projectRoot, `src/${entry.page.path}.tsx`))
            )
            const result = specialize('const options = __VPT_PAGE_OPTIONS__', entry.capsuleId, false)
            assert.ok(result)
            assert.deepEqual(Function(`${result.code}; return options`)(), {
                ...entry.page,
                prerender: entry.page.prerender === true
            })
        }
        const app = specialize('const config = __VPT_APP_CONFIG__', appEntry.capsuleId, false)
        assert.ok(app && 'meta' in app)
        assert.equal(app.meta[pageMetadataKey], pages)
        assert.deepEqual(
            Function(`${app.code}; return config`)().pages,
            pages.map((page) => page.path)
        )
        for (const entry of previousEntries) {
            if (!pages.some((page) => page.path === entry.page.path)) {
                assert.throws(() => resolveId(pageCapsuleId, entry.shellId, projectRoot), /Unknown Page capsule/)
                assert.throws(() => resolveId(pageComponentId, entry.capsuleId, projectRoot), /Unknown Page capsule/)
                assert.throws(
                    () => specialize('const options = __VPT_PAGE_OPTIONS__', entry.capsuleId, false),
                    /Unknown Page capsule/
                )
            }
        }
    }
})

for (const supportsPagePrerender of [false, true]) {
    test(`applies the fixed contract's prerender capability (${supportsPagePrerender}) to resolved pages`, () => {
        const page = Object.freeze({ path: 'pages/compiled/index', prerender: true })
        const fixedContract = Object.freeze({
            ...contract,
            options: Object.freeze({ ...contract.options, pages: [page] }),
            supportsPagePrerender
        })
        const resolver = createResolver(fixedContract)
        resolver.setPages([page])
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
    const resolver = createResolver(contract)
    resolver.setPages(contract.options.pages)
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
    const resolver = createResolver(contract)
    resolver.setPages(contract.options.pages)
    const result = resolver.specialize('export default __VPT_APP_CONFIG__', modules.appCapsule)

    assert.ok(result && 'meta' in result)
    assert.equal(result.meta[pageMetadataKey], contract.options.pages)
    assert.match(result.code, /"pages":\s*\[\s*["']pages\/home\/index["']/)
    assert.doesNotMatch(result.code, /stale\/page/)
    assert.match(result.code, /"navigationBarTitleText":\s*["']Example["']/)
})
