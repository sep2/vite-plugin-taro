import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveConfig } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../utils/packages.ts'
import { miniBootstrapId, miniPageCapsuleId } from '../mini/module/module.ts'
import { createAliSkeleton } from './create-ali-skeleton.ts'
import { createAliMiniContract, createAliMiniPlugins } from './plugins.ts'

for (const target of ['zfb', 'tb'] as const) {
    const options: VptOptions = {
        target,
        app: 'src/app.tsx',
        pages: [{ path: 'pages/home/index', config: { defaultTitle: 'Home' } }],
        appJson: { window: { titleBarColor: '#ffffff' } },
        projectConfigJson: {}
    }

    test(`${target}: shares the AXML compiler and Taro runtime with target-specific development entries`, () => {
        const contract = createAliMiniContract(options)
        const plugins = createAliMiniPlugins(options).flat(2)
        const names = plugins.flatMap((plugin) =>
            plugin && typeof plugin === 'object' && 'name' in plugin ? [plugin.name] : []
        )

        assert.equal(contract.options, options)
        assert.deepEqual(contract.options.appJson, { window: { titleBarColor: '#ffffff' } })
        assert.deepEqual(contract.options.pages, [{ path: 'pages/home/index', config: { defaultTitle: 'Home' } }])
        assert.deepEqual(contract.define, {})
        for (const name of [
            'vpt:mini-native-component',
            'vpt:mini-global',
            'vpt:mini-global-dev',
            'vpt:mini-watch',
            'vpt:mini-override'
        ]) {
            assert.ok(names.includes(name), name)
        }
        assert.ok(names.includes('vpt:ali-custom-tab-bar'))
        assert.equal(names.includes('vpt:tb-hmr'), target === 'tb')
        assert.equal(contract.taro.env, 'alipay')
        assert.equal(contract.taro.componentsReactPath, resolveTaroRuntime('plugin-platform-alipay/components-react'))
        assert.equal(contract.taro.targetRuntimePath, resolveTaroRuntime('plugin-platform-alipay/runtime'))
        assert.match(miniBootstrapId, /runtime[/\\]mini[/\\]amphibious[/\\]bootstrap\.(?:js|ts)$/)
        assert.match(miniPageCapsuleId, /runtime[/\\]mini[/\\]capsule[/\\]page\.(?:js|ts)$/)
        assert.deepEqual(contract.runtime, {
            devtoolsHmrRuntime: resolveVptRuntime(`${target}/dev/devtools-runtime`),
            interpreterHmrRuntime: resolveVptRuntime(`${target}/dev/interpreter-runtime`)
        })
        assert.deepEqual(contract.styles, { appFileName: 'app.acss', globalFileName: 'assets/global.acss' })
        assert.equal(contract.output.projectConfigFilename, 'mini.project.json')
        assert.equal(contract.output.projectPrivateConfigFilename, '.mini-ide/project-ide.json')
        assert.equal(contract.output.generateProjectSkeleton, createAliSkeleton)
    })

    for (const command of ['build', 'serve'] as const) {
        for (const watch of [undefined, {}]) {
            test(`${target}: selects its JSON rules for ${command} with watch=${!!watch}`, async () => {
                const config = await resolveConfig({ configFile: false, build: { watch } }, command)
                const rules = createAliMiniContract(options).override.filter((rule) => rule.apply(config))
                assert.deepEqual(
                    rules.map(({ name, content }) => ({ name, content })),
                    command === 'build' && watch
                        ? [{ name: 'mini.project.json', content: { developOptions: { hotReload: false } } }]
                        : []
                )
            })
        }
    }
}
