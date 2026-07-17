import assert from 'node:assert/strict'
import test from 'node:test'
import { transformPageModule } from './transform-page-module.ts'

const source = `import './app-module.js'
import { createPageConfig } from './taro-runtime.js'
import PageComponent from '\0vpt:page-component'
export default createPageConfig(PageComponent, __VITE_PLUGIN_TARO_PAGE_PATH__, undefined, __VITE_PLUGIN_TARO_PAGE_CONFIG__)`

test('specializes the real Page module for one route', () => {
    const id = '/plugin/runtime/wx/page-module.js?route=pages%2Fhome%2Findex'
    const result = transformPageModule({
        code: source,
        id,
        page: {
            path: 'pages/home/index',
            config: {
                navigationBarTitleText: 'Home'
            }
        },
        projectRoot: '/project'
    })

    assert.match(result.code, /from ["']\/@fs\/\/project\/src\/pages\/home\/index\.tsx["']/)
    assert.match(result.code, /["']pages\/home\/index["']/)
    assert.match(result.code, /navigationBarTitleText:\s*["']Home["']/)
    assert.doesNotMatch(result.code, /__VITE_PLUGIN_TARO_PAGE_|\0vpt:page-component/)
    assert.deepEqual(result.map.sources, [id])
})

test('rejects a Page module missing its specialization placeholders', () => {
    assert.throws(
        () =>
            transformPageModule({
                code: 'export default {}',
                id: '/plugin/runtime/wx/page-module.js?route=pages%2Fhome%2Findex',
                page: {
                    path: 'pages/home/index',
                    config: {}
                },
                projectRoot: '/project'
            }),
        /Expected one component, path, and config placeholder/
    )
})
