import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { normalizePath } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { appComponentId } from '../../client/constant.ts'
import { h5AppPath } from '../constant.ts'
import { createModuleResolver } from './module-resolver.ts'

const options: VptOptions = {
    target: 'h5',
    app: 'src/app.tsx',
    pages: [],
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
}

test('resolves the configured App component', () => {
    const resolver = createModuleResolver(options, [])
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
    const resolver = createModuleResolver(Object.freeze(options), pages)
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
