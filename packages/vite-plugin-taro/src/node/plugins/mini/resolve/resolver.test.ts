import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { normalizePath } from 'vite'
import { appComponentId } from '../../client/constant.ts'
import { createMiniContract } from '../../wx/plugins.ts'
import { pageCapsuleId, pageComponentId, vitePreloadId } from '../module/module.ts'
import { createResolver } from './resolver.ts'

const contract = createMiniContract({
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
    projectConfigJson: {},
    sitemapJson: {}
})
const modules = contract.runtime.modules

test('resolves fixed and route-specific private IDs', () => {
    const resolver = createResolver(contract)
    const projectRoot = path.resolve('/project')

    assert.deepEqual(resolver.applicationEntryIds, [
        modules.appCapsule,
        `${modules.pageCapsule}?route=pages%2Fhome%2Findex`
    ])
    assert.deepEqual(resolver.input, {
        'app.js': modules.appShell,
        'comp.js': modules.componentShell,
        bootstrap: modules.bootstrap,
        transport: modules.transport,
        'app-capsule': modules.appCapsule,
        'component-capsule': modules.componentCapsule,
        'custom-wrapper.js': modules.customWrapperShell,
        'pages/home/index.js': `${modules.pageShell}?route=pages%2Fhome%2Findex`,
        'pages/home/index-capsule': `${modules.pageCapsule}?route=pages%2Fhome%2Findex`
    })
    assert.equal(resolver.resolveId(vitePreloadId, undefined, projectRoot), modules.bootstrap)
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
    assert.match(result.code, /pages:\s*\[\s*["']pages\/home\/index["']/)
    assert.doesNotMatch(result.code, /stale\/page/)
    assert.match(result.code, /navigationBarTitleText:\s*["']Example["']/)
})
