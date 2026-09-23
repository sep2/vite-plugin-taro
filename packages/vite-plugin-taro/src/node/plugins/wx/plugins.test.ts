import assert from 'node:assert/strict'
import test from 'node:test'
import type { VptOptions } from '../../../options.ts'
import { createWxSkeleton } from './create-wx-skeleton.ts'
import { createWxMiniContract, createWxMiniPlugins } from './plugins.ts'

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
    assert.match(
        contract.taro.componentsReactPath,
        /taro-runtime[/\\]dist[/\\]plugin-platform-weapp[/\\]components-react\.js$/
    )
    assert.match(contract.taro.targetRuntimePath, /taro-runtime[/\\]dist[/\\]plugin-platform-weapp[/\\]runtime\.js$/)
    assert.match(contract.runtime.modules.bootstrap, /runtime[/\\]mini[/\\]amphibious[/\\]bootstrap\.(?:js|ts)$/)
    assert.match(contract.runtime.modules.devtoolsHmrRuntime, /runtime[/\\]wx[/\\]dev[/\\]devtools-runtime\.(?:js|ts)$/)
    assert.match(
        contract.runtime.modules.interpreterHmrRuntime,
        /runtime[/\\]wx[/\\]dev[/\\]interpreter-runtime\.(?:js|ts)$/
    )
    assert.deepEqual(contract.styles, {
        appFileName: 'app.wxss',
        globalFileName: 'assets/global.wxss'
    })
    assert.equal(contract.output.projectConfigFilename, 'project.config.json')
    assert.equal(contract.output.projectPrivateConfigFilename, 'project.private.config.json')
    assert.equal(contract.output.generateProjectSkeleton, createWxSkeleton)
    const plugins = createWxMiniPlugins(options)
    assert.equal(plugins.length, 8)
    for (const name of ['vpt:mini-native-component', 'vpt:mini-global', 'vpt:mini-global-dev', 'vpt:mini-watch']) {
        assert.ok(
            plugins
                .flat()
                .some((plugin) => plugin && typeof plugin === 'object' && 'name' in plugin && plugin.name === name),
            name
        )
    }
})
