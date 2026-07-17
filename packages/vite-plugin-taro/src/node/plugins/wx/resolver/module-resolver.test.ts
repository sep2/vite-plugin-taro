import assert from 'node:assert/strict'
import test from 'node:test'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import {
    appComponentId,
    appShellPath,
    bootstrapPath,
    pageModuleId,
    pageModulePath,
    pageShellPath,
    vitePreloadId
} from '../native/constant.ts'
import { createModuleResolver } from './module-resolver.ts'

const options: VitePluginTaroOptions = {
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
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
}

test('resolves fixed and route-specific private modules', () => {
    const resolver = createModuleResolver(options)
    const projectRoot = '/project'

    assert.deepEqual(resolver.input, {
        'app.js': appShellPath,
        'pages/home/index.js': `${pageShellPath}?route=pages%2Fhome%2Findex`
    })
    assert.equal(resolver.resolveId(vitePreloadId, undefined, projectRoot), bootstrapPath)
    assert.equal(resolver.resolveId(appComponentId, undefined, projectRoot), '/project/src/app.tsx')

    const pageModule = resolver.resolveId(pageModuleId, '/runtime/page.js?route=pages%2Fhome%2Findex', projectRoot)
    assert.equal(pageModule, `${pageModulePath}?route=pages%2Fhome%2Findex`)
})
