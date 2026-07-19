import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import type { OutputOptions, Plugin as RolldownPlugin } from 'rolldown'
import type { Plugin, ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { createWxDevelopmentPlugin } from './plugin.ts'

const options: VitePluginTaroOptions = {
    target: 'wx',
    app: 'src/app.ts',
    pages: [{ path: 'pages/home/index', config: {} }],
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
}

test('DevHost lets the DevEngine write the initial project and keeps HMR patch-only', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vite-plugin-taro-wx-dev-'))
    const outDir = path.join(root, 'dist/wx')
    const publicDir = path.join(root, 'public')
    const sourcePath = path.join(root, 'src/app.js')
    await mkdir(path.dirname(sourcePath), { recursive: true })
    await mkdir(publicDir)
    await writeFile(sourcePath, `export const message = 'initial'\n`)
    await writeFile(path.join(publicDir, 'public.txt'), 'public')

    const plugin = createWxDevelopmentPlugin(options)
    // DevHost needs only Vite's shared watcher for public files. Rolldown creates and owns the independent
    // source watcher inside the DevEngine, so this fixture never emits source events manually.
    const watcher = Object.assign(new EventEmitter(), {
        add() {},
        async unwatch() {}
    })
    // Stand in for the normal wx JSON/CSS output hooks while keeping the graph small enough for a focused DevEngine test.
    const viteTransformPlugin = {
        name: 'builtin:vite-transform',
        _options: {
            transformOptions: {
                sourcemap: true
            }
        }
    }
    const fixtureOutputPlugin: RolldownPlugin = {
        name: 'fixture-output',
        generateBundle() {
            this.emitFile({ type: 'asset', fileName: 'app.wxss', source: 'styles' })
            this.emitFile({ type: 'asset', fileName: 'app.json', source: '{}\n' })
        }
    }
    // Model only the private Vite surface declared by dev-host.ts. The original methods deliberately fail/return the
    // opposite result so the assertions prove that configureServer replaced them.
    const bundledDevelopment = {
        _devEngine: undefined as
            | {
                  close(): Promise<void>
                  getBundleState(): Promise<{ hasStaleOutput: boolean }>
              }
            | undefined,
        async getRolldownOptions() {
            return {
                input: { 'app.js': sourcePath },
                output: {
                    dir: outDir,
                    entryFileNames: 'assets/[name].js'
                } satisfies OutputOptions,
                plugins: [viteTransformPlugin as RolldownPlugin, plugin as RolldownPlugin, fixtureOutputPlugin],
                experimental: {
                    devMode: {
                        lazy: true,
                        implement: 'browser runtime'
                    }
                }
            }
        },
        async listen() {
            throw new Error('Vite listen must be replaced by the wx development adapter.')
        },
        async triggerBundleRegenerationIfStale() {
            return true
        }
    }

    const loggerErrors: unknown[] = []
    const loggerInfos: unknown[] = []
    let hmrMiddleware: ((request: IncomingMessage, response: ServerResponse) => void) | undefined
    const middlewares = {
        use(pathname: string, handler: (request: IncomingMessage, response: ServerResponse) => void) {
            if (pathname === '/__wx_hmr__') {
                hmrMiddleware = handler
            }
        }
    }
    const httpServer = Object.assign(new EventEmitter(), {
        listening: false,
        address() {
            return { address: '127.0.0.1', family: 'IPv4', port: 5174 }
        }
    })
    const server = {
        config: {
            root,
            publicDir,
            cacheDir: path.join(root, 'node_modules/.vite'),
            server: {
                origin: undefined
            },
            build: {
                outDir,
                assetsDir: 'assets',
                chunkSizeWarningLimit: 500,
                emptyOutDir: true,
                lib: false,
                minify: false,
                reportCompressedSize: true,
                rolldownOptions: {
                    output: {
                        entryFileNames: '[name]',
                        chunkFileNames: () => 'sub/p_test/assets/[hash].js',
                        assetFileNames: 'assets/[name]-[hash][extname]'
                    }
                }
            },
            logger: {
                info(message: unknown) {
                    loggerInfos.push(message)
                },
                error(message: unknown) {
                    loggerErrors.push(message)
                }
            }
        },
        environments: {
            client: {
                bundledDev: bundledDevelopment
            }
        },
        httpServer,
        middlewares,
        resolvedUrls: null,
        printUrls() {},
        watcher
    } as unknown as ViteDevServer

    try {
        const developmentConfig = getDevelopmentConfig(plugin)
        assert.equal(developmentConfig.define, undefined)
        assert.equal(developmentConfig.build?.sourcemap, false)
        assert.equal(developmentConfig.experimental?.bundledDev, true)

        await installConfigureServer(plugin, server)

        const rolldownOptions = await bundledDevelopment.getRolldownOptions()
        const devMode = rolldownOptions.experimental.devMode as Record<string, unknown>
        const outputOptions = rolldownOptions.output as OutputOptions
        assert.equal(devMode.lazy, false)
        assert.match(String(devMode.implement), /global\.__rolldown_runtime__/)
        assert.match(String(devMode.implement), /Math\.random\(\)\.toString\(36\)/)
        assert.equal(outputOptions.entryFileNames, '[name]')
        const chunkFileNames = outputOptions.chunkFileNames
        if (typeof chunkFileNames !== 'function') {
            throw new Error('Expected development chunk filename function.')
        }
        assert.equal(chunkFileNames({} as never), 'sub/p_test/assets/[name].js')
        assert.equal(outputOptions.assetFileNames, 'assets/[name][extname]')
        assert.equal(outputOptions.format, 'es')
        assert.equal(outputOptions.minify, true)
        assert.equal(outputOptions.sourcemap, false)
        assert.equal(viteTransformPlugin._options.transformOptions.sourcemap, false)

        const banner = outputOptions.banner
        if (typeof banner !== 'function') {
            throw new Error('Expected development banner function.')
        }
        assert.equal(
            await banner({ fileName: 'app.js' } as never),
            'const __rolldown_runtime__ = global.__rolldown_runtime__;\n__rolldown_runtime__.setHmrInfo(require("./hmr/info.js"));'
        )
        assert.equal(
            await banner({ fileName: 'pages/home/index.js' } as never),
            'const __rolldown_runtime__ = global.__rolldown_runtime__;\nrequire("../../hmr/update.js");'
        )

        // The replacement listen() does not return until Rolldown's initial incremental_write() has physically finished.
        await bundledDevelopment.listen()

        const initialApp = await readFile(path.join(outDir, 'app.js'), 'utf8')
        assert.match(initialApp, /initial/)
        assert.match(initialApp, /__rolldown_runtime__/)
        assert.match(initialApp, /Math\.random\(\)\.toString\(36\)/)
        assert.equal(await readFile(path.join(outDir, 'app.wxss'), 'utf8'), 'styles')
        assert.equal(await readFile(path.join(outDir, 'app.json'), 'utf8'), '{}\n')
        assert.equal(await readFile(path.join(outDir, 'public.txt'), 'utf8'), 'public')
        const hmrInfoPath = path.join(outDir, 'hmr/info.js')
        const hmrUpdatePath = path.join(outDir, 'hmr/update.js')
        await assert.rejects(readFile(hmrInfoPath, 'utf8'), { code: 'ENOENT' })
        await assert.rejects(readFile(hmrUpdatePath, 'utf8'), { code: 'ENOENT' })
        server.resolvedUrls = {
            local: ['http://127.0.0.1:5174/'],
            network: []
        }
        httpServer.emit('listening')
        await waitFor(async () => {
            try {
                const hmrInfo = await readHmrInfo(hmrInfoPath)
                return hmrInfo.endpoint === 'http://127.0.0.1:5174/__wx_hmr__'
            } catch (error) {
                if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                    return false
                }
                throw error
            }
        })
        const hmrInfo = await readHmrInfo(hmrInfoPath)
        assert.match(hmrInfo.buildId, /^[0-9a-f-]{36}$/)
        assert.equal(hmrInfo.endpoint, 'http://127.0.0.1:5174/__wx_hmr__')
        assert.ok(loggerInfos.some((message) => String(message).includes('WeChat DevTools: ./dist/wx')))
        assert.equal(await readFile(hmrUpdatePath, 'utf8'), 'module.exports = undefined;\n')

        assert.ok(hmrMiddleware)
        const registrations: Array<{ clientId: string; modules: string[] }> = []
        const engine = bundledDevelopment._devEngine as unknown as {
            registerModules(clientId: string, modules: string[]): Promise<void>
        }
        engine.registerModules = async (clientId, modules) => {
            registrations.push({ clientId, modules })
        }
        let responseEnded = false
        const response = {
            statusCode: 0,
            end() {
                responseEnded = true
            }
        } as unknown as ServerResponse
        hmrMiddleware(
            Object.assign(
                Readable.from([
                    JSON.stringify({ buildId: hmrInfo.buildId, clientId: 'runtime-1', modules: [sourcePath] })
                ]),
                { method: 'POST' }
            ) as IncomingMessage,
            response
        )
        await waitFor(async () => responseEnded)
        assert.equal(response.statusCode, 204)
        assert.deepEqual(registrations, [{ clientId: 'runtime-1', modules: [sourcePath] }])
        assert.equal(await bundledDevelopment.triggerBundleRegenerationIfStale(), false)

        // rebuildStrategy:'never' must make a normal watcher change patch-only. A stale bundle proves the HMR task ran;
        // byte-identical app.js proves skipWrite:false did not turn that task into a physical incremental rebuild.
        await writeFile(sourcePath, `export const message = 'updated'\n`)
        await waitFor(async () => Boolean((await bundledDevelopment._devEngine?.getBundleState())?.hasStaleOutput))
        assert.equal(await readFile(path.join(outDir, 'app.js'), 'utf8'), initialApp)

        await writeFile(path.join(publicDir, 'public.txt'), 'changed public')
        watcher.emit('all', 'change', path.join(publicDir, 'public.txt'))
        await waitFor(async () => (await readFile(path.join(outDir, 'public.txt'), 'utf8')) === 'changed public')

        assert.deepEqual(loggerErrors, [])
    } finally {
        // Detach DevHost first, then emulate Vite's ownership of `_devEngine` by closing it separately.
        await closePlugin(plugin)
        await bundledDevelopment._devEngine?.close()
        await rm(root, { recursive: true, force: true })
    }
})

function getDevelopmentConfig(plugin: Plugin): {
    define?: Record<string, string>
    build?: { sourcemap?: boolean | 'inline' | 'hidden' }
    experimental?: { bundledDev?: boolean }
} {
    const hook = plugin.config
    if (!hook) {
        throw new Error('Expected config hook.')
    }
    const handler = typeof hook === 'function' ? hook : hook.handler
    const result = handler.call({} as never, {}, { command: 'serve', mode: 'development' })
    if (!result || result instanceof Promise) {
        throw new Error('Expected synchronous development config.')
    }
    return result
}

async function installConfigureServer(plugin: Plugin, server: ViteDevServer): Promise<void> {
    const hook = plugin.configureServer
    if (!hook) {
        throw new Error('Expected configureServer hook.')
    }
    const handler = typeof hook === 'function' ? hook : hook.handler
    await handler.call({} as never, server)
}

async function closePlugin(plugin: Plugin): Promise<void> {
    const hook = plugin.closeBundle
    if (!hook) {
        return
    }
    const handler = typeof hook === 'function' ? hook : hook.handler
    await handler.call({} as never)
}

async function readHmrInfo(filePath: string): Promise<{ buildId: string; endpoint: string }> {
    const source = await readFile(filePath, 'utf8')
    const match = source.match(/^module\.exports = Object\.freeze\((.+)\);$/m)
    if (!match) {
        throw new Error('Expected rendered HMR info.')
    }
    return JSON.parse(match[1])
}

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await predicate()) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('Timed out waiting for wx development output.')
}
