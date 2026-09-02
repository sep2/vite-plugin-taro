import assert from 'node:assert/strict'
import test from 'node:test'
import type { VptOptions } from '../../../options.ts'
import { createMiniContract } from './plugins.ts'

test('creates the WX Mini Program contract without translating public options', () => {
    const options: VptOptions = {
        target: 'wx',
        app: 'src/app.tsx',
        pages: [],
        appJson: {},
        projectConfigJson: {}
    }

    const contract = createMiniContract(options)

    assert.equal(contract.options, options)
    assert.equal(contract.taro.env, 'weapp')
    assert.match(contract.taro.componentsReactPath, /plugin-platform-weapp/)
    assert.equal(contract.runtime.globalObject, 'global')
    assert.match(contract.runtime.modules.bootstrap, /runtime\/wx\/amphibious\/bootstrap\.(?:js|ts)$/)
    assert.deepEqual(contract.styles, {
        appFileName: 'app.wxss',
        globalFileName: 'assets/global.wxss'
    })
    assert.deepEqual(contract.output, { subpackagePlanningBudget: 1_900_000 })
})
