import assert from 'node:assert/strict'
import test from 'node:test'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import {
    appComponentId,
    appModulePath,
    appShellPath,
    bootstrapPath,
    pageModuleId,
    pageShellPath,
    vitePreloadId
} from './constant.ts'
import { createModuleResolver } from './resolver/module-resolver.ts'

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
    assert.equal(pageModule, '\0vpt:page-module/pages%2Fhome%2Findex')
    assert.equal(
        resolver.load(pageModule),
        `import ${JSON.stringify(appModulePath)}
import { createPageConfig } from '@tarojs/runtime'
import PageComponent from "/project/src/pages/home/index.tsx"

export default createPageConfig(PageComponent, "pages/home/index", undefined, {"navigationBarTitleText":"Home"})`
    )
})
