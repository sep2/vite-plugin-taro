import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveConfig } from 'vite'
import type { MiniContract, RuntimeModulesContract } from '../mini-contract.ts'
import { createMiniStylePlugin } from '../styles/plugins.ts'
import { createMiniDevelopmentPlugin, isMiniClientEnvironment, removeDevelopmentAppStyle } from './plugins.ts'

const runtimeModules = {
    bootstrap: '/runtime/bootstrap.ts',
    transport: '/runtime/transport.ts',
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
    runtime: {
        modules: runtimeModules
    },
    styles: {
        appFileName: 'app.native.css',
        globalFileName: 'assets/global.native.css'
    }
} satisfies Pick<MiniContract, 'options' | 'runtime' | 'styles'>

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
})

test('composes rebuild mode without patch transforms', async () => {
    const rebuildContract = {
        ...contract,
        options: {
            ...contract.options,
            hmr: { mode: 'rebuild' }
        }
    } satisfies Pick<MiniContract, 'options' | 'runtime' | 'styles'>
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
