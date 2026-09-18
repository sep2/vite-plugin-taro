import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import type { VptOptions } from '../../../options.ts'
import { transformH5App } from './transform-app.ts'

const options: VptOptions = {
    target: 'h5',
    app: 'src/app.tsx',
    pages: [
        {
            path: 'pages/home/index',
            config: {
                navigationBarTitleText: 'Home'
            }
        },
        {
            path: 'pages/about/index'
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

const id = '/plugin/runtime/h5/app.js'
const projectRoot = path.resolve('/project')
const source = `const config = __VPT_H5_APP_CONFIG__
config.routes = __VPT_H5_ROUTES__
`

test('specializes the physical H5 App configuration and routes', () => {
    const result = transformH5App({
        code: source,
        id,
        options,
        projectRoot
    })

    assert.match(result.code, /"router":\s*\{\}/)
    assert.match(result.code, /"pages":\s*\[\s*["']pages\/home\/index["']/)
    assert.doesNotMatch(result.code, /stale\/page/)
    assert.match(result.code, /path:\s*["']pages\/home\/index["']/)
    assert.match(result.code, /path:\s*["']pages\/about\/index["']/)
    assert.match(result.code, /"navigationBarTitleText":\s*["']Home["']/)
    const pageComponentPath = path.resolve(projectRoot, 'src/pages/home/index.tsx').replaceAll('\\', '/')
    assert.ok(result.code.includes(`import(${JSON.stringify(`/@fs/${pageComponentPath}`)})`))
    assert.ok(result.map)
    assert.equal(result.map.sources?.[0], id)
})

test('preserves H5 configuration, route overrides, and escaped paths without source maps', () => {
    const pagePath = 'pages/quote\'"/index'
    const title = '"}); throw new Error("not configuration"); ({"'
    const config = { title, optional: undefined }
    const result = transformH5App({
        code: source,
        id,
        options: {
            ...options,
            appJson: { router: { mode: 'browser' }, note: '__VPT_H5_ROUTES__' },
            pages: [
                { path: pagePath, config },
                { path: 'pages/overrides/index', config: { path: 'override', load: 'configured-load' } }
            ]
        },
        projectRoot,
        sourcemap: false
    })
    const observed: unknown = Function(`
        ${result.code}
        return [config.router, config.note, config.pages,
            config.routes.map(({ load, ...route }) => ({ ...route, loadType: typeof load }))]
    `)()
    assert.deepEqual(observed, [
        { mode: 'browser' },
        '__VPT_H5_ROUTES__',
        [pagePath, 'pages/overrides/index'],
        [
            { path: pagePath, title, loadType: 'function' },
            { path: 'override', loadType: 'string' }
        ]
    ])
    const component = `/@fs/${path.resolve(projectRoot, 'src', `${pagePath}.tsx`).replaceAll('\\', '/')}`
    assert.ok(result.code.includes(`import(${JSON.stringify(component)})`))
    assert.equal(result.map, null)
})

test('rejects an H5 App missing its specialization placeholders', () => {
    assert.throws(
        () =>
            transformH5App({
                code: 'export default {}',
                id,
                options,
                projectRoot
            }),
        /Expected one placeholder __VPT_H5_APP_CONFIG__, found 0/
    )
})
