import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Plugin, Rolldown, ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { createWxDevelopmentPlugin } from './dev.ts'

const options: VitePluginTaroOptions = {
    target: 'wx',
    app: 'src/app.ts',
    pages: [{ path: 'pages/home/index', config: {} }],
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
}

test('materializes initial and complete incremental DevEngine output', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vite-plugin-taro-wx-dev-'))
    const outDir = path.join(root, 'dist/wx')
    const publicDir = path.join(root, 'public')
    await mkdir(publicDir)
    await writeFile(path.join(publicDir, 'public.txt'), 'public')

    let triggerCount = 0
    let registeredClientId: string | undefined
    let registeredModuleIds: string[] = []
    const nextOutput = createOutput(root, 'updated', 'assets/new.js')

    const engine = {
        async ensureCurrentBuildFinish() {},
        async ensureLatestBuildOutput() {
            bundledDevelopment.storeOutputFiles(nextOutput)
        },
        async getBundleState() {
            return { lastBuildErrored: false }
        },
        registerModules(clientId: string, moduleIds: string[]) {
            registeredClientId = clientId
            registeredModuleIds = moduleIds
        },
        triggerFullBuild() {
            triggerCount++
        }
    }

    const bundledDevelopment = {
        _devEngine: engine,
        clients: {
            setupIfNeeded(_client: unknown, clientId: string) {
                registeredClientId = clientId
            }
        },
        async getRolldownOptions() {
            return {
                output: {
                    entryFileNames: 'assets/[name].js'
                },
                experimental: {
                    devMode: {
                        lazy: true,
                        implement: 'browser runtime'
                    }
                }
            }
        },
        handleHmrOutput(_client?: unknown, _files?: string[], _update?: { type: string }) {},
        storeOutputFiles(_output: Array<Rolldown.OutputAsset | Rolldown.OutputChunk>) {},
        async listen() {
            bundledDevelopment.storeOutputFiles(createInitialOutput(root))
        }
    }

    const loggerErrors: unknown[] = []
    const server = {
        config: {
            root,
            publicDir,
            cacheDir: path.join(root, 'node_modules/.vite'),
            build: {
                outDir,
                emptyOutDir: true,
                rolldownOptions: {
                    output: {
                        entryFileNames: '[name]',
                        chunkFileNames: 'assets/[hash].js',
                        assetFileNames: 'assets/[name][extname]'
                    }
                }
            },
            logger: {
                info() {},
                error(message: unknown) {
                    loggerErrors.push(message)
                }
            }
        },
        environments: {
            client: {
                bundledDev: bundledDevelopment
            }
        }
    } as unknown as ViteDevServer

    const plugin = createWxDevelopmentPlugin(options)

    try {
        const developmentConfig = getDevelopmentConfig(plugin)
        assert.equal(developmentConfig.define, undefined)
        assert.equal(developmentConfig.experimental?.bundledDev, true)

        installConfigureServer(plugin, server)

        const rolldownOptions = await bundledDevelopment.getRolldownOptions()
        const devMode = rolldownOptions.experimental.devMode as Record<string, unknown>
        const outputOptions = rolldownOptions.output as Record<string, unknown>
        assert.equal(devMode.lazy, false)
        assert.notEqual(devMode.implement, 'browser runtime')
        assert.doesNotMatch(String(devMode.implement), /\$Refresh(?:Reg|Sig)\$/)
        assert.match(String(devMode.implement), /global\.__rolldown_runtime__/)
        assert.doesNotMatch(String(devMode.implement), /globalThis/)
        assert.equal(outputOptions.entryFileNames, '[name]')
        assert.equal(outputOptions.format, 'es')

        const banner = outputOptions.banner
        if (typeof banner !== 'function') throw new Error('Expected development banner function.')
        assert.equal(
            await banner({ fileName: 'app.js' }),
            'const __rolldown_runtime__ = global.__rolldown_runtime__;\nrequire("./vpt-hmr/control.js");'
        )
        assert.equal(
            await banner({ fileName: 'pages/home/index.js' }),
            'const __rolldown_runtime__ = global.__rolldown_runtime__;\nrequire("../../vpt-hmr/update.js");'
        )

        await bundledDevelopment.listen()

        const initialControl = await readFile(path.join(outDir, 'vpt-hmr/control.js'), 'utf8')
        assert.equal(await readFile(path.join(outDir, 'app.js'), 'utf8'), 'initial')
        assert.equal(await readFile(path.join(outDir, 'app.wxss'), 'utf8'), 'styles')
        assert.equal(await readFile(path.join(outDir, 'app.json'), 'utf8'), '{}\n')
        assert.equal(await readFile(path.join(outDir, 'public.txt'), 'utf8'), 'public')
        assert.equal(registeredClientId, 'vite-plugin-taro-wx')
        assert.deepEqual(registeredModuleIds, ['src/app.ts'])

        bundledDevelopment.handleHmrOutput({}, ['src/app.ts'], { type: 'Patch' })
        await waitFor(async () => (await readFile(path.join(outDir, 'app.js'), 'utf8')) === 'updated')

        assert.equal(triggerCount, 1)
        assert.equal(await readFile(path.join(outDir, 'app.wxss'), 'utf8'), 'styles')
        assert.equal(await readFile(path.join(outDir, 'app.json'), 'utf8'), '{}\n')
        assert.equal(await readFile(path.join(outDir, 'assets/new.js'), 'utf8'), 'new')
        assert.equal(await readFile(path.join(outDir, 'assets/old.js'), 'utf8'), 'old')
        assert.notEqual(await readFile(path.join(outDir, 'vpt-hmr/control.js'), 'utf8'), initialControl)
        assert.deepEqual(loggerErrors, [])
    } finally {
        await closePlugin(plugin)
        await rm(root, { recursive: true, force: true })
    }
})

function createInitialOutput(root: string): Array<Rolldown.OutputAsset | Rolldown.OutputChunk> {
    return [
        createChunk('app.js', 'initial', [path.join(root, 'src/app.ts')]),
        createChunk('assets/old.js', 'old'),
        createAsset('src/app.wxss', 'styles'),
        createAsset('app.json', '{}\n')
    ]
}

function createOutput(
    root: string,
    appCode: string,
    chunkFileName: string
): Array<Rolldown.OutputAsset | Rolldown.OutputChunk> {
    return [createChunk('app.js', appCode, [path.join(root, 'src/app.ts')]), createChunk(chunkFileName, 'new')]
}

function createChunk(fileName: string, code: string, moduleIds: string[] = []): Rolldown.OutputChunk {
    return {
        type: 'chunk',
        fileName,
        code,
        moduleIds
    } as Rolldown.OutputChunk
}

function createAsset(fileName: string, source: string): Rolldown.OutputAsset {
    return {
        type: 'asset',
        fileName,
        source,
        names: [],
        originalFileNames: []
    } as unknown as Rolldown.OutputAsset
}

function getDevelopmentConfig(plugin: Plugin): {
    define?: Record<string, string>
    experimental?: { bundledDev?: boolean }
} {
    const hook = plugin.config
    if (!hook) throw new Error('Expected config hook.')
    const handler = typeof hook === 'function' ? hook : hook.handler
    const result = handler.call({} as never, {}, { command: 'serve', mode: 'development' })
    if (!result || result instanceof Promise) throw new Error('Expected synchronous development config.')
    return result
}

function installConfigureServer(plugin: Plugin, server: ViteDevServer): void {
    const hook = plugin.configureServer
    if (!hook) throw new Error('Expected configureServer hook.')
    const handler = typeof hook === 'function' ? hook : hook.handler
    handler.call({} as never, server)
}

async function closePlugin(plugin: Plugin): Promise<void> {
    const hook = plugin.closeBundle
    if (!hook) return
    const handler = typeof hook === 'function' ? hook : hook.handler
    await handler.call({} as never)
}

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await predicate()) return
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('Timed out waiting for wx development rematerialization.')
}
