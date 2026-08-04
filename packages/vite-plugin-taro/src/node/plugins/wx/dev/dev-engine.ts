import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import type { InputOptions, OutputOptions } from 'rolldown'
import { type DevEngine, dev, viteReporterPlugin } from 'rolldown/experimental'
import type { Connect, ViteDevServer } from 'vite'
import { resolvePackageFile } from '../../../utils/packages.ts'
import { appShellFileName } from '../module.ts'
import { type HmrInfo, hmrControlPath, hmrInfoFileName, renderHmrInfo, writeHmrFile } from './hmr-files.ts'

export type WxDevEngine = Readonly<{
    close: () => Promise<void>
}>

/** One metadata-only runtime report; executable code never travels over HTTP. */
type RuntimeReport = Readonly<{
    buildId: string
    version: number
    modules: string[]
}>

export async function createWxDevEngine({ server }: { server: ViteDevServer }): Promise<WxDevEngine> {
    const bundledDev = getBundledDev(server)

    // Per-server build state: the identity of the current full build. writeHmrInfo returns a
    // fresh buildId per full build; Rolldown correlates updates and registrations by this ID.
    let currentBuildId: string | undefined

    // Must install rolldown options before create engine
    installRolldownOptions()
    const engine: DevEngine = await createEngine()

    // The WX adapter owns the only DevEngine. Vite's default listen() would create a second
    // skip-write engine that renders into memory for browser HMR; instead the physical
    // engine's initial build must finish before the HTTP server becomes ready, because
    // DevTools opens the output directory directly and the app requires its files on disk.
    bundledDev._devEngine = engine
    bundledDev.triggerBundleRegenerationIfStale = async () => false
    bundledDev.listen = async () => {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
    }

    // Vite binds the port only after initServer (and therefore the initial build) completes, so
    // the actual port is not observable while onOutput runs for the first build. The App metadata
    // is written once the port is real; later full builds rewrite it from onOutput.
    server.httpServer?.once('listening', () => {
        void writeHmrInfo(server).then(adoptBuild)
    })

    // The runtime's metadata-only reports land on the control path; the buildId in each report
    // IS the Rolldown client ID.
    server.middlewares.use(hmrControlPath, (req, res) => void handleReport(req, res))

    return {
        close: async () => {
            await engine.close()
        }
    }

    /** Adopts the fresh buildId returned by writeHmrInfo. */
    function adoptBuild(buildId: string | undefined): void {
        if (buildId) {
            currentBuildId = buildId
        }
    }

    async function handleReport(req: Connect.IncomingMessage, res: ServerResponse): Promise<void> {
        if (req.method !== 'POST') {
            res.statusCode = 404
            res.end()
            return
        }

        try {
            const report = JSON.parse(await readBody(req)) as RuntimeReport
            server.config.logger.info(
                `[vite-plugin-taro] wx runtime report build ${report.buildId} version ${report.version}`
            )
            // Only the current build's reports register modules; delayed reports from older
            // builds are ignored so they can never influence the live build's boundaries.
            if (report.buildId === currentBuildId) {
                await engine.registerModules(report.buildId, report.modules)
            }
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ type: 'ok' }))
        } catch {
            res.statusCode = 400
            res.end()
        }
    }

    async function createEngine(): Promise<DevEngine> {
        const options = await bundledDev.getRolldownOptions()
        if (!options.output || Array.isArray(options.output)) {
            throw new Error('wx development requires exactly one Rolldown output.')
        }

        return dev(options, options.output, {
            onHmrUpdates: (result) => {
                if (result instanceof Error) {
                    server.config.logger.error(`[vite-plugin-taro] wx HMR update failed`, { error: result })
                }
            },
            onOutput: (result) => {
                if (result instanceof Error) {
                    server.config.logger.error(`[vite-plugin-taro] wx dev build failed`, { error: result })
                    return
                }
                // A fresh build identity per complete physical build; the App runtime reads it from
                // hmr/info.js before any module registers. The initial build's onOutput runs before
                // the port is bound, so the listening listener performs that first write.
                void writeHmrInfo(server).then(adoptBuild)
            },
            rebuildStrategy: 'never',
            watch: { skipWrite: false }
        })
    }

    /** Restores physical Mini Program output conventions after Vite applies browser bundled-dev defaults. */
    function installRolldownOptions(): void {
        const original = bundledDev.getRolldownOptions.bind(bundledDev)
        const runtimeSource = readFileSync(resolvePackageFile('dist/runtime/wx/dev/dev-runtime.js'), 'utf8')

        bundledDev.getRolldownOptions = async () => {
            const options = await original()
            if (Array.isArray(options.output)) {
                throw new Error('wx development requires one configured Rolldown output.')
            }
            options.output ??= {}
            const output = options.output
            const configuredOutput = server.config.build.rolldownOptions.output
            if (Array.isArray(configuredOutput)) {
                throw new Error('wx development supports one configured Rolldown output.')
            }

            const configured = (configuredOutput ?? {}) as Record<string, unknown>
            Object.assign(output, configured, {
                assetFileNames: createStableFileNames(configured.assetFileNames, 'assets/[name][extname]'),
                banner: createHmrInfoBanner(),
                chunkFileNames: createStableFileNames(configured.chunkFileNames, 'assets/[name].js'),
                entryFileNames: createStableFileNames(configured.entryFileNames, '[name]'),
                format: 'es',
                minify: true,
                sourcemap: false
            })

            options.experimental ??= {}
            options.experimental.devMode = {
                ...(typeof options.experimental.devMode === 'object' ? options.experimental.devMode : {}),
                implement: runtimeSource,
                lazy: false
            }
            options.plugins = [options.plugins, createViteReporter(server)]
            disableViteOxcSourcemap(options.plugins)
            return options
        }
    }
}

/** Writes the immutable App metadata every full build starts from. */
async function writeHmrInfo(server: ViteDevServer): Promise<string | undefined> {
    try {
        const httpServer = server.httpServer
        if (!httpServer) {
            return undefined
        }
        const address = httpServer.address()
        if (!address || typeof address === 'string') {
            // Port not bound yet (initial build); the listening listener writes the file.
            return undefined
        }
        const buildId = randomUUID()
        const info: HmrInfo = {
            buildId,
            endpoint: `${server.config.server.https ? 'https' : 'http'}://${resolveEndpointHost(server)}:${address.port}${hmrControlPath}`
        }
        await writeHmrFile(server.config.build.outDir, hmrInfoFileName, renderHmrInfo(info))
        return buildId
    } catch (e) {
        if (Error.isError(e)) {
            server.config.logger.error(`[vite-plugin-taro] wx HMR write failed`, { error: e })
        } else {
            server.config.logger.error(`[vite-plugin-taro] wx HMR write failed with unknown error: ${e}`)
        }
        return undefined
    }
}

const maximumBodyBytes = 64 * 1024
function readBody(req: Connect.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = ''
        req.on('data', (chunk: Buffer) => {
            body += chunk.toString('utf8')
            if (body.length > maximumBodyBytes) {
                reject(new Error('report body too large'))
                req.destroy()
            }
        })
        req.on('end', () => resolve(body))
        req.on('error', reject)
    })
}

/** The bound address host, or loopback for wildcard binds; IPv6 literals are bracketed. */
function resolveEndpointHost(server: ViteDevServer): string {
    const address = server.httpServer?.address()
    if (!address || typeof address === 'string') {
        return '127.0.0.1'
    }
    if (address.address === '0.0.0.0' || address.address === '::') {
        // Wildcard binds accept loopback connections; 127.0.0.1 is the address DevTools can reach.
        return '127.0.0.1'
    }
    return address.address.includes(':') ? `[${address.address}]` : address.address
}

/**
 * Prepends the app entry with the info.js require and the runtime initialization. Banners are
 * plain text appended after Rolldown's analysis, so the require never becomes a chunk dependency
 * (a bare require inside the injected runtime source would stall the build), and the wx render
 * pipeline keeps this text after the hoisted chunk requires — so the runtime chunk exists before
 * initialize runs, and initialize runs before any module registers.
 */
function createHmrInfoBanner(): (chunk: { name: string }) => string {
    return (chunk) =>
        chunk.name === appShellFileName ? "__rolldown_runtime__.initialize(require('./hmr/info.js'));\n" : ''
}

function createStableFileNames<Value>(addon: unknown, fallback: string): string | ((value: Value) => string) {
    if (typeof addon === 'function') {
        return (value) => toStableFileName(String(addon(value)))
    }
    return toStableFileName(typeof addon === 'string' ? addon : fallback)
}

function toStableFileName(fileName: string): string {
    return fileName
        .replace(/(^|\/)\[hash(?::\d+)?\](?=\.|$)/g, '$1[name]')
        .replace(/[-_.]\[hash(?::\d+)?\]/g, '')
        .replace(/\[hash(?::\d+)?\]/g, '[name]')
}

type ViteTransformPlugin = {
    _options?: { transformOptions?: { sourcemap?: boolean } }
    name?: string
}

function disableViteOxcSourcemap(pluginOption: unknown): void {
    if (Array.isArray(pluginOption)) {
        pluginOption.forEach(disableViteOxcSourcemap)
        return
    }
    if (!pluginOption || typeof pluginOption !== 'object') {
        return
    }
    const plugin = pluginOption as ViteTransformPlugin
    if (plugin.name === 'builtin:vite-transform' && plugin._options?.transformOptions) {
        plugin._options.transformOptions.sourcemap = false
    }
}

function createViteReporter(server: ViteDevServer) {
    const { build, logger, root } = server.config
    return viteReporterPlugin({
        assetsDir: path.join(build.assetsDir, '/'),
        chunkLimit: 2000,
        isLib: Boolean(build.lib),
        isTty: Boolean(process.stdout.isTTY && !process.env.CI),
        logInfo: (message) => logger.info(message),
        reportCompressedSize: false,
        root,
        warnLargeChunks: false
    })
}

type BundledDevRolldownOptions = InputOptions & {
    experimental?: {
        [key: string]: unknown
        devMode?: boolean | Record<string, unknown>
    }
    output?: OutputOptions | OutputOptions[]
}

type BundledDev = {
    _devEngine?: DevEngine
    getRolldownOptions(): Promise<BundledDevRolldownOptions>
    listen(): Promise<void>
    triggerBundleRegenerationIfStale(): Promise<boolean>
}

function getBundledDev(server: ViteDevServer): BundledDev {
    const bundledDev = server.environments.client.bundledDev as unknown as BundledDev | undefined
    if (!bundledDev) {
        throw new Error('Vite did not create the wx bundled-development environment.')
    }
    return bundledDev
}
