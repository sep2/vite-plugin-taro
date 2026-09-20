import assert from 'node:assert/strict'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { runInNewContext } from 'node:vm'
import type { OutputOptions, PreRenderedChunk, RenderedChunk } from 'rolldown'
import { DevRuntime } from 'rolldown/experimental/runtime'
import { type BuildOptions, createLogger, createServer } from 'vite'
import { packageRequire, resolveRuntimeFile } from '../../../utils/packages.ts'
import { createTtMiniContract } from '../../tt/plugins.ts'
import { createZfbMiniContract } from '../../zfb/plugins.ts'
import type { MiniContract, RuntimeModulesContract } from '../mini-contract.ts'
import { type BundledDev, installMiniDevOptions, requireSingleOutput } from './mini-dev-options.ts'
import { createDevtoolsHmrMode } from './modes/devtools/devtools-hmr-mode.ts'
import { createInterpreterHmrMode } from './modes/interpreter/interpreter-hmr-mode.ts'

const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))

const runtimeModules = {
    bootstrap: resolveRuntimeFile('mini/amphibious/bootstrap'),
    appShell: resolveRuntimeFile('mini/native/app'),
    appCapsule: resolveRuntimeFile('mini/capsule/app'),
    componentShell: resolveRuntimeFile('mini/native/component'),
    componentCapsule: resolveRuntimeFile('mini/capsule/component'),
    customWrapperShell: resolveRuntimeFile('mini/native/custom-wrapper'),
    pageShell: resolveRuntimeFile('mini/native/page'),
    pageCapsule: resolveRuntimeFile('mini/capsule/page'),
    devtoolsHmrRuntime: resolveRuntimeFile('wx/dev/devtools-runtime'),
    interpreterHmrRuntime: resolveRuntimeFile('wx/dev/interpreter-runtime')
} satisfies RuntimeModulesContract

const options = {
    options: {
        target: 'wx',
        app: 'src/app.tsx',
        pages: [
            {
                path: 'pages/home/index',
                config: {}
            }
        ],
        appJson: {},
        projectConfigJson: {}
    }
} satisfies Pick<MiniContract, 'options'>
const hmrMode = createDevtoolsHmrMode(runtimeModules)

/** These tests inspect options only: never watch workspace files or populate its shared dependency cache. */
async function createOptionsServer(context: TestContext, build: BuildOptions) {
    const server = await createServer({
        root: packageRoot,
        configFile: false,
        customLogger: createLogger('silent'),
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { watch: null },
        build
    })
    context.after(() => server.close())
    assert.equal(server.environments.client.depsOptimizer, undefined)
    return server
}

function createPreRenderedChunk(name: string): PreRenderedChunk {
    return {
        name,
        isEntry: false,
        isDynamicEntry: true,
        facadeModuleId: null,
        moduleIds: [],
        exports: []
    }
}

function createRenderedChunk(name: string, fileName: string): RenderedChunk {
    return {
        type: 'chunk',
        name,
        fileName,
        isEntry: true,
        isDynamicEntry: false,
        facadeModuleId: null,
        moduleIds: [],
        exports: [],
        imports: [],
        dynamicImports: [],
        modules: {}
    }
}

/** The wrapper supplies the shared global exactly once, without discovery or virtual imports in the nested build. */
function assertRuntimeWrapper(source: unknown): void {
    assert.ok(typeof source === 'string')
    assert.match(source, /^__rolldown_runtime__ = \(function \(globalThis\) \{/)
    assert.match(source, /return globalThis\.__rolldown_runtime__;\n\}\)\(__VPT_GLOBAL__\);$/)
    assert.equal(source.match(/__VPT_GLOBAL__/g)?.length, 1)
    assert.doesNotMatch(source, /vpt\.fake\.global|getGlobalThis|vptGlobal|vpt:global-binding/)
    assert.match(source, /Reflect\.set\(globalThis,\s*['"`]__rolldown_runtime__['"`]/)
    assert.doesNotMatch(source, /Reflect\.(?:get|set)\((?:wx|my),/)

    // Runtime installation may mutate only the supplied provider, never the VM's ambient global object.
    const shared: Record<string, unknown> = {}
    const context = { DevRuntime, __VPT_GLOBAL__: shared }
    Object.defineProperty(context, 'globalThis', {
        get() {
            assert.fail('The HMR wrapper must not read ambient globalThis')
        }
    })
    // Final rendering declares this local cell; the wrapper initializes it before generated registrations execute.
    const runtime: unknown = runInNewContext(`let __rolldown_runtime__;\n${source}\n__rolldown_runtime__;`, context, {
        contextCodeGeneration: { strings: false, wasm: false }
    })
    assert.strictEqual(runtime, shared.__rolldown_runtime__)
    assert.ok(shared.__rolldown_runtime__ instanceof DevRuntime)
    assert.equal(typeof shared.queueMicrotask, 'function')
    assert.equal(Reflect.has(context, '__rolldown_runtime__'), false)
}

test('adapts physical wx development output without changing configured filenames', async (context) => {
    const configuredChunkFileNames = (chunk: PreRenderedChunk): string => `chunks/${chunk.name}.[hash].js`
    const configuredOutput: OutputOptions = {
        assetFileNames: 'static/[name]-[hash:8][extname]',
        chunkFileNames: configuredChunkFileNames,
        entryFileNames: '[name]-[hash]'
    }
    const server = await createOptionsServer(context, { rolldownOptions: { output: configuredOutput } })

    const generatedOutput: OutputOptions = {}
    const viteTransformOptions = { sourcemap: true }
    const viteTransformPlugin = {
        name: 'builtin:vite-transform',
        _options: { transformOptions: viteTransformOptions }
    }
    const bundledDev: BundledDev = {
        async getRolldownOptions() {
            return {
                output: generatedOutput,
                plugins: [[{ name: 'fixture:existing-plugin' }], viteTransformPlugin],
                experimental: {
                    devMode: {
                        retainedFixtureOption: 'retained'
                    }
                }
            }
        },
        async listen() {},
        async triggerBundleRegenerationIfStale() {
            return true
        }
    }

    installMiniDevOptions({ bundledDev: bundledDev, server: server, contract: options, hmrMode: hmrMode })
    const adaptedOptions = await bundledDev.getRolldownOptions()
    const output = requireSingleOutput(adaptedOptions)
    const devMode = adaptedOptions.experimental?.devMode

    assert.equal(output, generatedOutput)
    assert.equal(output.assetFileNames, configuredOutput.assetFileNames)
    assert.equal(output.chunkFileNames, configuredChunkFileNames)
    assert.equal(typeof output.chunkFileNames, 'function')
    if (typeof output.chunkFileNames !== 'function') {
        assert.fail('Expected configured chunk naming to remain a function')
    }
    assert.equal(output.chunkFileNames(createPreRenderedChunk('feature')), 'chunks/feature.[hash].js')
    assert.equal(output.entryFileNames, configuredOutput.entryFileNames)
    assert.equal(output.format, 'es')
    assert.equal(output.minify, true)
    assert.equal(output.sourcemap, false)
    assert.deepEqual(configuredOutput, {
        assetFileNames: 'static/[name]-[hash:8][extname]',
        chunkFileNames: configuredChunkFileNames,
        entryFileNames: '[name]-[hash]'
    })
    assert.equal(viteTransformOptions.sourcemap, false)

    assert.ok(devMode && typeof devMode === 'object')
    assert.equal(devMode.retainedFixtureOption, 'retained')
    assert.equal(devMode.lazy, false)
    assert.equal(devMode.skipCommonRuntimeInjection, false)
    assertRuntimeWrapper(devMode.implement)

    const banner = output.banner
    assert.equal(typeof banner, 'function')
    if (typeof banner !== 'function') {
        assert.fail('Expected a generated entry banner')
    }
    assert.equal(
        await banner(createRenderedChunk('app.js', 'app.js')),
        "__rolldown_runtime__.initialize(require('./hmr/info.js'));\n"
    )
    assert.equal(
        await banner(createRenderedChunk('pages/home/index.js', 'pages/home/index.js')),
        "__rolldown_runtime__.applyPatches(require('../../hmr/patches.js'));\n"
    )
    assert.equal(await banner(createRenderedChunk('assets/vendor.js', 'assets/vendor.js')), '')
})

for (const [target, createContract] of [
    ['zfb', createZfbMiniContract],
    ['tt', createTtMiniContract]
] as const) {
    for (const [mode, createMode] of [
        ['devtools', createDevtoolsHmrMode],
        ['interpreter', createInterpreterHmrMode]
    ] as const) {
        test(`passes the shared global to ${target} ${mode} HMR without virtual imports`, async (context) => {
            const contract = createContract({
                target,
                app: 'src/app.tsx',
                pages: [{ path: 'pages/home/index', config: {} }],
                appJson: {},
                projectConfigJson: {}
            })
            const server = await createOptionsServer(context, {})
            const bundledDev: BundledDev = {
                async getRolldownOptions() {
                    return {}
                },
                async listen() {},
                async triggerBundleRegenerationIfStale() {
                    return true
                }
            }

            installMiniDevOptions({
                bundledDev: bundledDev,
                server: server,
                contract: contract,
                hmrMode: createMode(contract.runtime.modules)
            })
            const adapted = await bundledDev.getRolldownOptions()
            const devMode = adapted.experimental?.devMode

            assert.ok(devMode && typeof devMode === 'object')
            assertRuntimeWrapper(devMode.implement)
        })
    }
}

test('leaves naming unspecified when Vite has no configured output', async (context) => {
    // These process-global presentation flags are restored after this isolated test-file process invokes the reporter factory.
    const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    const previousCi = process.env.CI
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })
    delete process.env.CI
    context.after(() => {
        if (ttyDescriptor) {
            Object.defineProperty(process.stdout, 'isTTY', ttyDescriptor)
        } else {
            Reflect.deleteProperty(process.stdout, 'isTTY')
        }
        if (previousCi === undefined) {
            delete process.env.CI
        } else {
            process.env.CI = previousCi
        }
    })
    const server = await createOptionsServer(context, {})
    const bundledDev: BundledDev = {
        async getRolldownOptions() {
            return {
                plugins: [false],
                experimental: { devMode: true }
            }
        },
        async listen() {},
        async triggerBundleRegenerationIfStale() {
            return true
        }
    }

    installMiniDevOptions({ bundledDev: bundledDev, server: server, contract: options, hmrMode: hmrMode })
    const adapted = await bundledDev.getRolldownOptions()
    const output = requireSingleOutput(adapted)

    assert.equal(output.assetFileNames, undefined)
    assert.equal(output.chunkFileNames, undefined)
    assert.equal(output.entryFileNames, undefined)
    assert.deepEqual(adapted.experimental?.devMode, {
        implement:
            typeof adapted.experimental?.devMode === 'object' ? adapted.experimental.devMode.implement : undefined,
        lazy: false,
        skipCommonRuntimeInjection: false
    })
})

test('rejects missing and multiple generated outputs before creating a development engine', () => {
    assert.throws(() => requireSingleOutput({}), /requires exactly one Rolldown output/)
    assert.throws(() => requireSingleOutput({ output: [{}, {}] }), /requires exactly one Rolldown output/)
})

test('rejects output arrays from both Vite configuration and generated Rolldown options', async (context) => {
    const server = await createOptionsServer(context, { rolldownOptions: { output: [{}, {}] } })

    const configuredArrayBundledDev: BundledDev = {
        async getRolldownOptions() {
            return { output: {} }
        },
        async listen() {},
        async triggerBundleRegenerationIfStale() {
            return true
        }
    }
    installMiniDevOptions({
        bundledDev: configuredArrayBundledDev,
        server: server,
        contract: options,
        hmrMode: hmrMode
    })
    await assert.rejects(
        () => configuredArrayBundledDev.getRolldownOptions(),
        /Mini Program development supports one configured Rolldown output/
    )

    const generatedArrayBundledDev: BundledDev = {
        async getRolldownOptions() {
            return { output: [{}, {}] }
        },
        async listen() {},
        async triggerBundleRegenerationIfStale() {
            return true
        }
    }
    installMiniDevOptions({
        bundledDev: generatedArrayBundledDev,
        server: server,
        contract: options,
        hmrMode: hmrMode
    })
    await assert.rejects(
        () => generatedArrayBundledDev.getRolldownOptions(),
        /Mini Program development requires one configured Rolldown output/
    )
})
