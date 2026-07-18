import assert from 'node:assert/strict'
import test from 'node:test'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { appComponentId } from '../../client/constant.ts'
import { h5AppPath } from '../constant.ts'
import { createModuleResolver } from './module-resolver.ts'

const options: VitePluginTaroOptions = {
    target: 'h5',
    app: 'src/app.tsx',
    pages: [],
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
}

test('resolves the configured App component', () => {
    const resolver = createModuleResolver(options)

    assert.equal(resolver.resolveId({ id: appComponentId, projectRoot: '/project' }), '/project/src/app.tsx')
    assert.equal(resolver.resolveId({ id: 'react', projectRoot: '/project' }), undefined)
})

test('specializes only the physical H5 App', async () => {
    const resolver = createModuleResolver(options)
    const source = `const config = __VITE_PLUGIN_TARO_H5_APP_CONFIG__
config.routes = __VITE_PLUGIN_TARO_H5_ROUTES__
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
