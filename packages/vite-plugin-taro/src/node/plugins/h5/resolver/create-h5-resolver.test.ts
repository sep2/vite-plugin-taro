import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { normalizePath } from 'vite'
import type { VptOptions, VptPageOption } from '../../../../options.ts'
import { appComponentId } from '../../client/constant.ts'
import { h5AppPath } from '../constant.ts'
import { createH5Resolver } from './create-h5-resolver.ts'

const options: VptOptions = {
    target: 'h5',
    app: 'src/app.tsx',
    pages: [],
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
}

test('resolves the configured App component', () => {
    const resolver = createH5Resolver(options)
    const projectRoot = path.resolve('/project')

    assert.equal(
        resolver.resolveId({ id: appComponentId, projectRoot }),
        normalizePath(path.resolve(projectRoot, 'src/app.tsx'))
    )
    assert.equal(resolver.resolveId({ id: 'react', projectRoot }), undefined)
})

test('specializes only the physical H5 App using resolved pages', () => {
    const pages = Object.freeze([
        Object.freeze({ path: 'pages/resolved/index', config: { navigationBarTitleText: 'Resolved page' } })
    ])
    const resolver = createH5Resolver(Object.freeze({ ...options, pages: [...pages] }))
    const source = `const config = __VPT_H5_APP_CONFIG__
config.routes = __VPT_H5_ROUTES__
`

    const result = resolver.transform({
        code: source,
        id: h5AppPath,
        projectRoot: path.resolve('/project')
    })
    assert.ok(result)
    assert.match(result.code, /"pages":\s*\[\s*"pages\/resolved\/index"/)
    assert.match(result.code, /import\([^)]*\/src\/pages\/resolved\/index\.tsx/)
    assert.match(result.code, /"navigationBarTitleText":\s*"Resolved page"/)
    assert.equal(
        resolver.transform({
            code: source,
            id: '/project/src/app.tsx',
            projectRoot: '/project'
        }),
        undefined
    )
})

test('uses each configured route list for both App config and route loaders', () => {
    const home = Object.freeze({ path: 'pages/home', config: { navigationBarTitleText: 'Home' } })
    const detail = Object.freeze({ path: 'pages/detail', config: { navigationBarTitleText: 'Detail' } })
    const snapshots: readonly (readonly VptPageOption[])[] = [
        Object.freeze([home, detail]),
        Object.freeze([detail, home]),
        Object.freeze([{ path: 'pages/home', config: { navigationBarTitleText: 'Updated' } }]),
        Object.freeze([])
    ]
    for (const pages of snapshots) {
        const resolver = createH5Resolver({
            ...options,
            pages: [...pages],
            appJson: { window: { navigationBarTitleText: 'Application' } }
        })
        const result = resolver.transform({
            code: 'const config = __VPT_H5_APP_CONFIG__;\nconst routes = __VPT_H5_ROUTES__;',
            id: h5AppPath,
            projectRoot: path.resolve('/project'),
            sourcemap: false
        })
        assert.ok(result)
        const [configLine, routes] = result.code.split('\n')
        const config = JSON.parse(configLine.slice('const config = '.length, -1))
        assert.deepEqual(
            config.pages,
            pages.map((page) => page.path)
        )
        assert.deepEqual(config.window, { navigationBarTitleText: 'Application' })
        assert.equal([...routes.matchAll(/load:async/g)].length, pages.length)
        const positions = pages.map((page) => routes.indexOf(`path:${JSON.stringify(page.path)}`))
        assert.ok(positions.every((position) => position >= 0))
        assert.deepEqual(
            positions,
            positions.toSorted((a, b) => a - b)
        )
        for (const page of pages) {
            assert.ok(routes.includes(JSON.stringify(page.config)))
        }
    }
})
