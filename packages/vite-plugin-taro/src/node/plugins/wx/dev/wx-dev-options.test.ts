import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import type { OutputOptions, RenderedChunk } from 'rolldown'
import { createLogger, createServer } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { packageRequire } from '../../../utils/packages.ts'
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
    const configuredOutput: OutputOptions = {
        assetFileNames: 'static/[name]-[hash:8][extname]',
        chunkFileNames: 'chunks/[name].[hash].js',
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
    const bundledDev: BundledDev = {
        async getRolldownOptions() {
            return {
                output: generatedOutput,
                plugins: [{ name: 'fixture:existing-plugin' }],
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

    installWxDevOptions({ bundledDev, server, options })
    const adaptedOptions = await bundledDev.getRolldownOptions()
    const output = requireSingleOutput(adaptedOptions)
    const devMode = adaptedOptions.experimental?.devMode

    assert.equal(output, generatedOutput)
    assert.equal(output.assetFileNames, 'static/[name][extname]')
    assert.equal(output.chunkFileNames, 'chunks/[name].js')
    assert.equal(output.entryFileNames, '[name]')
    assert.equal(output.format, 'es')
    assert.equal(output.minify, true)
    assert.equal(output.sourcemap, false)
    assert.deepEqual(configuredOutput, {
        assetFileNames: 'static/[name]-[hash:8][extname]',
        chunkFileNames: 'chunks/[name].[hash].js',
        entryFileNames: '[name]-[hash]'
    })

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
