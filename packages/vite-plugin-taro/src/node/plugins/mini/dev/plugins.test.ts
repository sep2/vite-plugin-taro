import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveConfig } from 'vite'
import type { MiniContract, RuntimeModulesContract } from '../mini-contract.ts'
import { pageComponentId } from '../module/module.ts'
import { createMiniStylePlugin } from '../styles/plugins.ts'
import { createMiniDevelopmentPlugin, isMiniClientEnvironment, removeDevelopmentAppStyle } from './plugins.ts'

const runtimeModules = {
    bootstrap: '/runtime/bootstrap.ts',
    appShell: '/runtime/app-shell.ts',
    appCapsule: '/runtime/app-capsule.ts',
    componentShell: '/runtime/component-shell.ts',
    componentCapsule: '/runtime/component-capsule.ts',
    customWrapperShell: '/runtime/custom-wrapper-shell.ts',
    pageShell: '/runtime/page-shell.ts',
    pageCapsule: '/runtime/page-capsule.ts',
    devtoolsHmrRuntime: '/runtime/devtools-hmr.ts',
    interpreterHmrRuntime: '/runtime/interpreter-hmr.ts'
} satisfies RuntimeModulesContract

const contract = {
    options: {
        target: 'wx',
        app: 'src/app.tsx',
        pages: [],
        appJson: {},
        projectConfigJson: {}
    },
    taro: {
        env: 'fixture',
        componentsReactPath: '/runtime/components-react.ts',
        targetRuntimePath: '/runtime/target.ts'
    },
    runtime: {
        modules: runtimeModules
    },
    styles: {
        appFileName: 'app.native.css',
        globalFileName: 'assets/global.native.css'
    },
    output: {
        projectConfigFilename: 'project.fixture.json',
        projectPrivateConfigFilename: 'project.private.fixture.json',
        generateProjectSkeleton() {
            return []
        }
    }
} satisfies MiniContract

test('assigns physical Mini Program host ownership only to the client environment', () => {
    assert.equal(isMiniClientEnvironment({ name: 'client' }), true)
    assert.equal(isMiniClientEnvironment({ name: 'ssr' }), false)
})

test('preserves physical outputs and composes the selected mode across development restarts', async () => {
    const config = await resolveConfig(
        {
            configFile: false,
            plugins: createMiniDevelopmentPlugin(contract, createMiniStylePlugin(contract, [import.meta.filename]))
        },
        'serve'
    )

    assert.equal(config.build.emptyOutDir, false)
    assert.ok(config.plugins.some((plugin) => plugin.name === 'vpt:mini-page-shell-hmr'))
    assert.ok(config.plugins.some((plugin) => plugin.name === 'vpt:mini-page-capsule-hmr'))
})

test('composes rebuild mode without patch transforms', async () => {
    const rebuildContract = {
        ...contract,
        options: {
            ...contract.options,
            hmr: { mode: 'rebuild' }
        }
    } satisfies MiniContract
    const config = await resolveConfig(
        {
            configFile: false,
            plugins: createMiniDevelopmentPlugin(
                rebuildContract,
                createMiniStylePlugin(rebuildContract, [import.meta.filename])
            )
        },
        'serve'
    )

    assert.ok(!config.plugins.some((plugin) => plugin.name === 'vpt:mini-page-shell-hmr'))
    assert.ok(config.plugins.some((plugin) => plugin.name === 'vpt:mini-page-capsule-hmr'))
})

test('does not inject Page HMR into a build run in development mode', async () => {
    const config = await resolveConfig(
        {
            configFile: false,
            mode: 'development',
            plugins: createMiniDevelopmentPlugin(contract, createMiniStylePlugin(contract, [import.meta.filename]))
        },
        'build'
    )
    assert.ok(!config.plugins.some((plugin) => plugin.name === 'vpt:mini-page-capsule-hmr'))
})

test('reports a Page capsule whose component cannot be resolved', async () => {
    const config = await resolveConfig(
        {
            configFile: false,
            plugins: createMiniDevelopmentPlugin(contract, createMiniStylePlugin(contract, [import.meta.filename]))
        },
        'serve'
    )
    const plugin = config.plugins.find((candidate) => candidate.name === 'vpt:mini-page-capsule-hmr')
    assert.ok(plugin)
    const transform = plugin.transform
    assert.ok(transform && typeof transform === 'object')

    const capsuleId = '/runtime/page-capsule.ts?route=pages%2Fhome%2Findex'
    await assert.rejects(
        Reflect.apply(
            transform.handler,
            {
                resolve: async (id: string, importer: string) => {
                    assert.equal(id, pageComponentId)
                    assert.equal(importer, capsuleId)
                    return null
                }
            },
            ['createPageConfig(PageComponent)', capsuleId]
        ),
        /Failed to resolve Page component imported by/
    )
})

test('transfers the App style entry from complete output to the development host', () => {
    const appStyle = { type: 'asset', source: '@import "./assets/global.native.css";\n' }
    const globalStyle = { type: 'asset', source: '.app {}' }
    const bundle = {
        'app.native.css': appStyle,
        'assets/global.native.css': globalStyle
    }

    removeDevelopmentAppStyle(bundle, contract.styles.appFileName)

    assert.deepEqual(bundle, { 'assets/global.native.css': globalStyle })
})
