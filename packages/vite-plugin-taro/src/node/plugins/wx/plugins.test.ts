import assert from 'node:assert/strict'
import test from 'node:test'
import type { VptOptions } from '../../../options.ts'
import { createWxMiniContract } from './plugins.ts'

test('creates the WX Mini Program contract without translating public options', () => {
    const options: VptOptions = {
        target: 'wx',
        app: 'src/app.tsx',
        pages: [],
        appJson: {},
        projectConfigJson: {}
    }

    const contract = createWxMiniContract(options)

    assert.equal(contract.options, options)
    assert.equal(contract.taro.env, 'weapp')
    assert.match(contract.taro.componentsReactPath, /plugin-platform-weapp/)
    assert.match(contract.taro.platformRuntimePath, /plugin-platform-weapp/)
    assert.equal(contract.runtime.globalObject, 'global')
    assert.match(contract.runtime.modules.bootstrap, /runtime\/mini\/amphibious\/bootstrap\.(?:js|ts)$/)
    assert.match(contract.runtime.modules.devtoolsHmrRuntime, /runtime\/wx\/dev\/devtools-runtime\.(?:js|ts)$/)
    assert.match(contract.runtime.modules.interpreterHmrRuntime, /runtime\/wx\/dev\/interpreter-runtime\.(?:js|ts)$/)
    assert.deepEqual(contract.styles, {
        appFileName: 'app.wxss',
        globalFileName: 'assets/global.wxss'
    })
    assert.deepEqual(Object.keys(contract.output), ['subpackagePlanningBudget', 'generateProjectSkeleton'])
    assert.equal(contract.output.subpackagePlanningBudget, 1_900_000)
    assert.equal(typeof contract.output.generateProjectSkeleton, 'function')
})
