import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { normalizePath } from 'vite'
import { appComponentId } from '../../client/constant.ts'
import type { MiniContract } from '../mini-contract.d.ts'
import {
    appCapsulePath,
    appShellPath,
    bootstrapPath,
    componentCapsulePath,
    componentShellPath,
    customWrapperShellPath,
    pageCapsuleId,
    pageCapsulePath,
    pageComponentId,
    pageShellPath,
    transportPath,
    vitePreloadId
} from '../module/module.ts'
import { createResolver } from './resolver.ts'

const options: MiniContract = {
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
}

test('resolves fixed and route-specific private IDs', () => {
    const resolver = createResolver(options)
    const projectRoot = path.resolve('/project')

    assert.deepEqual(resolver.applicationEntryIds, [appCapsulePath, `${pageCapsulePath}?route=pages%2Fhome%2Findex`])
    assert.deepEqual(resolver.input, {
        'app.js': appShellPath,
        'comp.js': componentShellPath,
        bootstrap: bootstrapPath,
        transport: transportPath,
        'app-capsule': appCapsulePath,
        'component-capsule': componentCapsulePath,
        'custom-wrapper.js': customWrapperShellPath,
        'pages/home/index.js': `${pageShellPath}?route=pages%2Fhome%2Findex`,
        'pages/home/index-capsule': `${pageCapsulePath}?route=pages%2Fhome%2Findex`
    })
    assert.equal(resolver.resolveId(vitePreloadId, undefined, projectRoot), bootstrapPath)
    assert.equal(
        resolver.resolveId(appComponentId, undefined, projectRoot),
        normalizePath(path.resolve(projectRoot, 'src/app.tsx'))
    )

    const pageCapsule = resolver.resolveId(pageCapsuleId, '/runtime/page.js?route=pages%2Fhome%2Findex', projectRoot)
    assert.equal(pageCapsule, `${pageCapsulePath}?route=pages%2Fhome%2Findex`)
    assert.equal(
        resolver.resolveId(pageComponentId, pageCapsule, projectRoot),
        normalizePath(path.resolve(projectRoot, 'src/pages/home/index.tsx'))
    )
})

test('rejects Page-private imports without one configured route origin', () => {
    const resolver = createResolver(options)
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
        () => resolver.resolveId(pageComponentId, pageCapsulePath, projectRoot),
        /Page capsule import must originate from a route module/
    )
})

test('specializes the App capsule with the configured App JSON', async () => {
    const resolver = createResolver(options)
    const result = await resolver.specialize('export default __VPT_APP_CONFIG__', appCapsulePath)

    assert.ok(result)
    assert.match(result.code, /pages:\s*\[\s*["']pages\/home\/index["']/)
    assert.doesNotMatch(result.code, /stale\/page/)
    assert.match(result.code, /navigationBarTitleText:\s*["']Example["']/)
})
