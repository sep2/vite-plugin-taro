import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { type Rolldown, resolveConfig } from 'vite'
import { createMemoryTestProject } from '../../../tests/create-memory-test-project.ts'
import { pageMetadataKey } from '../../page/page-metadata-key.ts'
import type { MiniContract, RuntimeContract } from '../mini-contract.ts'
import { miniAppCapsuleId, pageComponentId } from '../module/module.ts'
import { createMiniStylePlugin } from '../styles/plugins.ts'
import { createMiniDevelopmentPlugin, isMiniClientEnvironment, removeDevelopmentAppStyle } from './plugins.ts'

const runtimeModules = {
    devtoolsHmrRuntime: '/runtime/devtools-hmr.ts',
    interpreterHmrRuntime: '/runtime/interpreter-hmr.ts'
} satisfies RuntimeContract

const contract = {
    options: {
        target: 'wx',
        app: 'src/app.tsx',
        pages: [],
        appJson: {},
        projectConfigJson: {}
    },
    supportsPagePrerender: true,
    automaticSubpackages: true,
    define: {},
    taro: {
        hostPath: '/runtime/host.ts',
        env: 'fixture',
        componentsReactPath: '/runtime/components-react.ts',
        targetRuntimePath: '/runtime/target.ts'
    },
    runtime: runtimeModules,
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
    },
    override: []
} satisfies MiniContract

test('assigns physical Mini Program host ownership only to the client environment', () => {
    assert.equal(isMiniClientEnvironment({ name: 'client' }), true)
    assert.equal(isMiniClientEnvironment({ name: 'ssr' }), false)
})

test('preserves physical outputs and composes the selected mode across development restarts', async () => {
    const config = await resolveConfig(
        {
            configFile: false,
            plugins: createMiniDevelopmentPlugin(contract, createMiniStylePlugin(contract))
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
            plugins: createMiniDevelopmentPlugin(rebuildContract, createMiniStylePlugin(rebuildContract))
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
            plugins: createMiniDevelopmentPlugin(contract, createMiniStylePlugin(contract))
        },
        'build'
    )
    assert.ok(!config.plugins.some((plugin) => plugin.name === 'vpt:mini-page-capsule-hmr'))
})

test('reports a Page capsule whose component cannot be resolved', async () => {
    const config = await resolveConfig(
        {
            configFile: false,
            plugins: createMiniDevelopmentPlugin(contract, createMiniStylePlugin(contract))
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
            ['host.createPage(PageComponent)', capsuleId]
        ),
        /Failed to resolve Page component imported by/
    )
})

test('cleans the first written output using resolved App metadata and preserves host-owned page styles', async (context) => {
    const root = createMemoryTestProject(context)
    const outDir = path.join(root, 'dist')
    const preserved = [
        'emitted.txt',
        contract.output.projectConfigFilename,
        contract.output.projectPrivateConfigFilename,
        contract.styles.appFileName,
        contract.styles.globalFileName,
        'pages/resolved/index.css',
        'hmr/info.js',
        'hmr/patches.js'
    ]
    const obsolete = ['obsolete.js', 'pages/stale/index.css']
    for (const fileName of [...preserved, ...obsolete]) {
        const filename = path.join(outDir, fileName)
        mkdirSync(path.dirname(filename), { recursive: true })
        writeFileSync(filename, fileName)
    }

    const config = await resolveConfig(
        {
            root,
            configFile: false,
            plugins: createMiniDevelopmentPlugin(contract, createMiniStylePlugin(contract)),
            build: { outDir: 'dist' }
        },
        'serve'
    )
    const plugin = config.plugins.find((candidate) => candidate.name === 'vpt:mini-dev')
    const writeBundle = plugin?.writeBundle
    assert.ok(writeBundle && typeof writeBundle === 'object')
    const pages = Object.freeze([Object.freeze({ path: 'pages/resolved/index' })])
    const appId = path.join(root, 'compiler', 'app.ts')
    // The test controls asynchronous resolution so cleanup must wait for the exact compiler graph identity.
    const ready = Promise.withResolvers<void>()
    const hookContext = {
        environment: { config },
        resolve: context.mock.fn(async (id: string) => {
            assert.equal(id, miniAppCapsuleId)
            await ready.promise
            return { id: appId }
        }),
        getModuleInfo: context.mock.fn((id: string) => {
            assert.equal(id, appId)
            return { meta: { [pageMetadataKey]: pages } }
        })
    }
    const bundle = {
        'emitted.txt': {
            type: 'asset',
            fileName: 'emitted.txt',
            source: 'emitted.txt'
        }
    } satisfies Record<string, Pick<Rolldown.OutputAsset, 'type' | 'fileName' | 'source'>>
    const writing = Reflect.apply(writeBundle.handler, hookContext, [{}, bundle])
    try {
        assert.equal(existsSync(path.join(outDir, 'obsolete.js')), true)
    } finally {
        ready.resolve()
        await writing
    }
    for (const fileName of preserved) {
        assert.equal(readFileSync(path.join(outDir, fileName), 'utf8'), fileName)
    }
    for (const fileName of obsolete) {
        assert.equal(existsSync(path.join(outDir, fileName)), false)
    }
    assert.equal(existsSync(path.join(outDir, 'pages/stale')), true)

    const laterFile = path.join(outDir, 'later.txt')
    writeFileSync(laterFile, 'retained across recovery builds')
    await Reflect.apply(writeBundle.handler, hookContext, [{}, {}])
    assert.equal(existsSync(laterFile), true)
    assert.equal(hookContext.resolve.mock.callCount(), 1)
    assert.equal(hookContext.getModuleInfo.mock.callCount(), 1)
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
