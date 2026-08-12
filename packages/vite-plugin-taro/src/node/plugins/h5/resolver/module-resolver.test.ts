import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
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
    const resolver = createModuleResolver(options)
    const projectRoot = path.resolve('/project')

    assert.equal(resolver.resolveId({ id: appComponentId, projectRoot }), path.resolve(projectRoot, 'src/app.tsx'))
    assert.equal(resolver.resolveId({ id: 'react', projectRoot }), undefined)
})

test('specializes only the physical H5 App', async () => {
    const resolver = createModuleResolver(options)
    const source = `const config = __VPT_H5_APP_CONFIG__
config.routes = __VPT_H5_ROUTES__
`

    assert.ok(
        await resolver.transform({
            code: source,
            id: h5AppPath,
            projectRoot: '/project'
        })
    )
    assert.equal(
        resolver.transform({
            code: source,
            id: '/project/src/app.tsx',
            projectRoot: '/project'
        }),
        undefined
    )
})
