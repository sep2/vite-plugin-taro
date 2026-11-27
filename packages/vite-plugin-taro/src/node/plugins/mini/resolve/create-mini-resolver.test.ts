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
import { createMiniResolver } from './create-mini-resolver.ts'

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

test('resolves fixed IDs and configured Page IDs', () => {
    const resolver = createMiniResolver(contract)
    const projectRoot = path.resolve('/project')

    assert.deepEqual(resolver.appEntry, {
        capsuleId: modules.appCapsule,
        capsuleName: 'app-capsule',
        shellId: modules.appShell,
        shellName: 'app.js'
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

    assert.deepEqual(resolver.pages, [
        {
            option: contract.options.pages[0],
            route: 'pages/home/index',
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
            const resolver = createMiniResolver(targetContract)

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
    const resolver = createMiniResolver(targetContract)

    const customHostResolver = createMiniResolver({
        ...targetContract,
        taro: { ...targetContract.taro, hostPath: '/runtime/custom-host.ts' }
    })
    assert.equal(
        customHostResolver.resolveId(rendererHostId, undefined, path.resolve('/project')),
        '/runtime/custom-host.ts'
    )
    assert.deepEqual(resolver.appEntry, customHostResolver.appEntry)
    assert.deepEqual(resolver.pages, customHostResolver.pages)
})

test('preserves resolved Page order in the App-owned entries', () => {
    const pages = [
        Object.freeze({ path: 'pages/z-last/index', config: { title: 'First' } }),
        Object.freeze({ path: 'features/account/pages/a-first/index' })
    ]
    Object.freeze(pages)
    const input = Object.freeze({ ...contract, options: Object.freeze({ ...contract.options, pages }) })
    const resolver = createMiniResolver(input)

    const { appEntry } = resolver
    const pageEntries = resolver.pages
    assert.deepEqual(pageEntries, [
        {
            option: pages[0],
            route: 'pages/z-last/index',
            capsuleId: `${modules.pageCapsule}?route=pages%2Fz-last%2Findex`,
            capsuleName: 'pages/z-last/index-capsule',
            shellId: `${modules.pageShell}?route=pages%2Fz-last%2Findex`,
            shellName: 'pages/z-last/index.js'
        },
        {
            option: pages[1],
            route: 'features/account/pages/a-first/index',
            capsuleId: `${modules.pageCapsule}?route=features%2Faccount%2Fpages%2Fa-first%2Findex`,
            capsuleName: 'features/account/pages/a-first/index-capsule',
            shellId: `${modules.pageShell}?route=features%2Faccount%2Fpages%2Fa-first%2Findex`,
            shellName: 'features/account/pages/a-first/index.js'
        }
    ])
    assert.deepEqual(appEntry, createMiniResolver(input).appEntry)
})

test('resolves a named package entry by public route and loads its declared component', () => {
    const resolver = createMiniResolver({
        ...contract,
        options: { ...contract.options, pages: [{ path: 'detail', subpackage: 'orders' }] }
    })
    const [entry] = resolver.pages
    assert.ok(entry)
    assert.equal(entry.route, 'orders/detail')
    assert.equal(entry.option.subpackage, 'orders')
    assert.equal(entry.shellName, 'orders/detail.js')
    const root = path.resolve('/project')
    assert.equal(resolver.resolveId(pageCapsuleId, entry.shellId, root), entry.capsuleId)
    assert.equal(
        resolver.resolveId(pageComponentId, entry.capsuleId, root),
        normalizePath(path.join(root, 'src/detail.tsx'))
    )
})

test('retains App entries with an empty resolved Page list', () => {
    const resolver = createMiniResolver({ ...contract, options: { ...contract.options, pages: [] } })

    assert.deepEqual(resolver.appEntry, {
        capsuleId: modules.appCapsule,
        capsuleName: 'app-capsule',
        shellId: modules.appShell,
        shellName: 'app.js'
    })
    assert.deepEqual(resolver.pages, [])
})

test('uses configured pages for entries, route resolution and capsule metadata', () => {
    const projectRoot = path.resolve('/project')
    const generations: readonly VptPageOption[][] = [
        [{ path: 'pages/home/index', config: { title: 'Home' }, prerender: true }, { path: 'pages/detail/index' }],
        [{ path: 'pages/new/index' }, { path: 'pages/home/index', config: { title: 'Updated home' } }],
        []
    ]

    for (const pages of generations) {
        const resolver = createMiniResolver({ ...contract, options: { ...contract.options, pages } })
        const { appEntry, resolveId, specialize } = resolver
        assert.deepEqual(
            resolver.pages.map(({ option, route }) => ({ option, route })),
            pages.map((page) => ({ option: page, route: page.path }))
        )
        for (const [index, entry] of resolver.pages.entries()) {
            const declaration = pages[index]!
            assert.strictEqual(entry.option, declaration)
            assert.equal(resolveId(pageCapsuleId, entry.shellId, projectRoot), entry.capsuleId)
            assert.equal(
                resolveId(pageComponentId, entry.capsuleId, projectRoot),
                normalizePath(path.resolve(projectRoot, `src/${entry.option.path}.tsx`))
            )
            const result = specialize('const options = __VPT_PAGE_OPTIONS__', entry.capsuleId, false)
            assert.ok(result)
            assert.deepEqual(Function(`${result.code}; return options`)(), {
                ...declaration,
                prerender: entry.option.prerender === true
            })
        }
        const app = specialize('const config = __VPT_APP_CONFIG__', appEntry.capsuleId, false)
        assert.ok(app && 'meta' in app)
        assert.strictEqual(app.meta[pageMetadataKey], resolver.pages)
        assert.deepEqual(
            Function(`${app.code}; return config`)().pages,
            pages.map((page) => page.path)
        )
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
        const resolver = createMiniResolver(fixedContract)
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
    const resolver = createMiniResolver(contract)
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
    const resolver = createMiniResolver(contract)
    const result = resolver.specialize('export default __VPT_APP_CONFIG__', modules.appCapsule)

    assert.ok(result && 'meta' in result)
    assert.strictEqual(result.meta[pageMetadataKey], resolver.pages)
    assert.match(result.code, /"pages":\s*\[\s*["']pages\/home\/index["']/)
    assert.doesNotMatch(result.code, /stale\/page/)
    assert.match(result.code, /"navigationBarTitleText":\s*["']Example["']/)
})
