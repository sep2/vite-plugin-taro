import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import type { OutputOptions, PreRenderedChunk, RenderedChunk } from 'rolldown'
import { createLogger, createServer } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { packageRequire } from '../../../utils/packages.ts'
import { createDevtoolsHmrMode } from './modes/devtools/devtools-hmr-mode.ts'
import { type BundledDev, installWxDevOptions, requireSingleOutput } from './wx-dev-options.ts'

const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))

const options: VptOptions = {
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
const hmrMode = createDevtoolsHmrMode()

function createPreRenderedChunk(name: string): PreRenderedChunk {
    return {
        name,
        isEntry: false,
        isDynamicEntry: true,
        facadeModuleId: undefined,
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

test('adapts configured output into a stable physical wx development project', async (context) => {
    const configuredChunkFileNames = (chunk: PreRenderedChunk): string => `chunks/${chunk.name}.[hash].js`
    const configuredOutput: OutputOptions = {
        assetFileNames: 'static/[name]-[hash:8][extname]',
        chunkFileNames: configuredChunkFileNames,
        entryFileNames: '[name]-[hash]'
    }
    const server = await createServer({
        root: packageRoot,
        configFile: false,
        customLogger: createLogger('silent'),
        build: {
            rolldownOptions: {
                output: configuredOutput
            }
        }
    })
    context.after(() => server.close())

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

    installWxDevOptions({ bundledDev: bundledDev, server: server, options: options, hmrMode: hmrMode })
    const adaptedOptions = await bundledDev.getRolldownOptions()
    const output = requireSingleOutput(adaptedOptions)
    const devMode = adaptedOptions.experimental?.devMode

    assert.equal(output, generatedOutput)
    assert.equal(output.assetFileNames, 'static/[name][extname]')
    assert.equal(typeof output.chunkFileNames, 'function')
    if (typeof output.chunkFileNames !== 'function') {
        assert.fail('Expected configured chunk naming to remain a function')
    }
    assert.equal(output.chunkFileNames(createPreRenderedChunk('feature')), 'chunks/feature.js')
    assert.equal(output.entryFileNames, '[name]')
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
    assert.equal(typeof devMode.implement, 'string')
    assert.match(String(devMode.implement), /__rolldown_runtime__/)

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

test('supplies stable output defaults when Vite has no configured output', async (context) => {
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
    const server = await createServer({
        root: packageRoot,
        configFile: false,
        customLogger: createLogger('silent')
    })
    context.after(() => server.close())
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

    installWxDevOptions({ bundledDev: bundledDev, server: server, options: options, hmrMode: hmrMode })
    const adapted = await bundledDev.getRolldownOptions()
    const output = requireSingleOutput(adapted)

    assert.equal(output.assetFileNames, 'assets/[name][extname]')
    assert.equal(output.chunkFileNames, 'assets/[name].js')
    assert.equal(output.entryFileNames, '[name]')
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
    const server = await createServer({
        root: packageRoot,
        configFile: false,
        customLogger: createLogger('silent'),
        build: {
            rolldownOptions: {
                output: [{}, {}]
            }
        }
    })
    context.after(() => server.close())

    const configuredArrayBundledDev: BundledDev = {
        async getRolldownOptions() {
            return { output: {} }
        },
        async listen() {},
        async triggerBundleRegenerationIfStale() {
            return true
        }
    }
    installWxDevOptions({
        bundledDev: configuredArrayBundledDev,
        server: server,
        options: options,
        hmrMode: hmrMode
    })
    await assert.rejects(
        () => configuredArrayBundledDev.getRolldownOptions(),
        /wx development supports one configured Rolldown output/
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
    installWxDevOptions({
        bundledDev: generatedArrayBundledDev,
        server: server,
        options: options,
        hmrMode: hmrMode
    })
    await assert.rejects(
        () => generatedArrayBundledDev.getRolldownOptions(),
        /wx development requires one configured Rolldown output/
    )
})
