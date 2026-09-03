import assert from 'node:assert/strict'
import test from 'node:test'
import type { VptOptions } from '../../../options.ts'
import { createZfbMiniContract, createZfbMiniPlugins } from './plugins.ts'

test('creates the ZFB Mini Program contract with one normalized config snapshot', () => {
    const options: VptOptions = {
        target: 'zfb',
        app: 'src/app.tsx',
        pages: [
            {
                path: 'pages/home/index',
                config: { navigationBarTitleText: 'Home' }
            }
        ],
        appJson: { window: { navigationBarBackgroundColor: '#ffffff' } },
        projectConfigJson: {}
    }

    const contract = createZfbMiniContract(options)
    const plugins = createZfbMiniPlugins(options)

    assert.notEqual(contract.options, options)
    assert.deepEqual(contract.options.appJson, { window: { titleBarColor: '#ffffff' } })
    assert.deepEqual(contract.options.pages, [
        {
            path: 'pages/home/index',
            config: { defaultTitle: 'Home' }
        }
    ])
    assert.deepEqual(options.appJson, { window: { navigationBarBackgroundColor: '#ffffff' } })
    assert.equal(plugins.length, 4)
    assert.equal(contract.taro.env, 'alipay')
    assert.match(contract.taro.componentsReactPath, /plugin-platform-alipay/)
    assert.match(contract.taro.platformRuntimePath, /plugin-platform-alipay/)
    assert.match(contract.runtime.modules.bootstrap, /runtime\/mini\/amphibious\/bootstrap\.(?:js|ts)$/)
    assert.match(contract.runtime.modules.pageCapsule, /runtime\/mini\/capsule\/page\.(?:js|ts)$/)
    assert.match(contract.runtime.modules.devtoolsHmrRuntime, /runtime\/zfb\/dev\/devtools-runtime\.(?:js|ts)$/)
    assert.match(contract.runtime.modules.interpreterHmrRuntime, /runtime\/zfb\/dev\/interpreter-runtime\.(?:js|ts)$/)
    assert.deepEqual(contract.styles, {
        appFileName: 'app.acss',
        globalFileName: 'assets/global.acss'
    })
    assert.deepEqual(Object.keys(contract.output), ['generateProjectSkeleton'])
    assert.equal(typeof contract.output.generateProjectSkeleton, 'function')
})
