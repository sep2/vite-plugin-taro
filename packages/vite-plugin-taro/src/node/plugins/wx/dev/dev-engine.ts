import type { ServerResponse } from 'node:http'
import path from 'node:path'
import type { InputOptions, OutputOptions } from 'rolldown'
import { build } from 'rolldown'
import { type DevEngine, dev, viteReporterPlugin } from 'rolldown/experimental'
import type { Connect, ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { resolvePackageFile } from '../../../utils/packages.ts'
import { appShellFileName } from '../module.ts'
import {
    type HmrInfo,
    type HostPatch,
    hmrControlPath,
    hmrInfoFileName,
    hmrPatchesFileName,
    renderHmrInfo,
    renderInitialHmrPatches,
    writeHmrFile
} from './hmr-files.ts'
import { PatchPublisher } from './patch-publisher.ts'

export type WxDevEngine = Readonly<{
    close: () => Promise<void>
}>

/** One metadata-only runtime report; executable code never travels over HTTP. */
type ModulesReport = Readonly<{
    kind: 'modules'
    buildId: string
    modules: string[]
}>

type VersionReport = Readonly<{
    kind: 'version'
    buildId: string
    version: number
}>

export async function createWxDevEngine({
    server,
    options
}: {
    server: ViteDevServer
    options: VitePluginTaroOptions
}): Promise<WxDevEngine> {
    const bundledDev = getBundledDev(server)

    // All build/patch/hold state lives in the publisher; the engine keeps no mutable state.
    // The publisher is pure — the physical write is this injected callback.
    const publisher = new PatchPublisher((content) =>
        writeHmrFile(server.config.build.outDir, hmrPatchesFileName, content)
    )

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
    server.httpServer?.once('listening', startFreshBuild)

    // The runtime's metadata-only reports land on the control path; the buildId in each report
    // IS the Rolldown client ID.
    server.middlewares.use(hmrControlPath, (req, res) => void handleReport(req, res))

    return {
        close: async () => {
            await engine.close()
        }
    }

    /** Rotates the build identity and materializes the App metadata for it. */
    async function startFreshBuild(): Promise<void> {
        const buildId = publisher.startBuild()
        await writeHmrInfo(server, buildId)
    }

    async function handleReport(req: Connect.IncomingMessage, res: ServerResponse): Promise<void> {
        if (req.method !== 'POST') {
            res.statusCode = 404
            res.end()
            return
        }

        try {
            const report = JSON.parse(await readBody(req)) as ModulesReport | VersionReport
            // Only the current build's reports register modules or hold version polls; delayed
            // reports from older builds are ignored so they can never influence the live build.
            if (!publisher.isCurrentBuild(report.buildId)) {
                res.end()
                return
            }
            if (report.kind === 'modules') {
                await engine.registerModules(report.buildId, report.modules)
                res.end()
                return
            }
            // The version report is the long poll: hold it until a publication happens, so the
            // runtime's re-opened request always carries its current version. The response
            // carries no information — it is only a latch release.
            publisher.hold(report.version, () => {
                res.end()
            })
        } catch (e) {
            logWxError(server.config.logger, 'wx HMR report failed', e)
            res.statusCode = 400
            res.end()
        }
    }

    /** Creates the physical DevEngine with the WX adapter hooks. */
    async function createEngine(): Promise<DevEngine> {
        const rolldownOptions = await bundledDev.getRolldownOptions()
        if (!rolldownOptions.output || Array.isArray(rolldownOptions.output)) {
            throw new Error('wx development requires exactly one Rolldown output.')
        }

        return dev(rolldownOptions, rolldownOptions.output, {
            onHmrUpdates: async (result) => {
                if (result instanceof Error) {
                    logWxError(server.config.logger, 'wx HMR update failed', result)
                    return
                }
                // Collect the batch first: one HMR event can carry several patches, and they
                // must be appended and published as a single unit. The DevEngine is the sole
                // producer and only emits updates for the current build, so no build gate is
                // needed here.
                const batch: HostPatch[] = []
                for (const { update } of result.updates) {
                    if (update.type === 'Noop') {
                        continue
                    }
                    if (update.type === 'Patch') {
                        batch.push({ code: update.code, fileName: update.filename })
                        continue
                    }
                    server.config.logger.info(`[vite-plugin-taro] wx unhandled update ${update.type}`)
                }
                if (batch.length > 0) {
                    publisher.produce(batch)
                    server.config.logger.info(`[vite-plugin-taro] wx patch produced version ${batch.length}`)
                }
            },
            onOutput: async (result) => {
                if (result instanceof Error) {
                    logWxError(server.config.logger, 'wx dev build failed', result)
                    return
                }
                // A fresh build identity per complete physical build; the App runtime reads it
                // from hmr/info.js before any module registers.
                await startFreshBuild()
            },
            rebuildStrategy: 'never',
            watch: { skipWrite: false }
        })
    }

    /** Restores physical Mini Program output conventions after Vite applies browser bundled-dev defaults. */
    function installRolldownOptions(): void {
        const original = bundledDev.getRolldownOptions.bind(bundledDev)

        bundledDev.getRolldownOptions = async () => {
            const rolldownOptions = await original()
            if (Array.isArray(rolldownOptions.output)) {
                throw new Error('wx development requires one configured Rolldown output.')
            }
            rolldownOptions.output ??= {}
            const output = rolldownOptions.output
            const configuredOutput = server.config.build.rolldownOptions.output
            if (Array.isArray(configuredOutput)) {
                throw new Error('wx development supports one configured Rolldown output.')
            }

            // Every page entry must depend on hmr/patches.js: DevTools classifies a changed Page
            // dependency as Page JavaScript hot reload and re-executes live Pages, which is the only
            // trigger that delivers physical patches while keeping the App heap alive.
            const pageFiles = new Set(options.pages.map((page) => `${page.path}.js`))

            const configured = (configuredOutput ?? {}) as Record<string, unknown>
            Object.assign(output, configured, {
                assetFileNames: createStableFileNames(configured.assetFileNames, 'assets/[name][extname]'),
                banner: createEntryBanner(pageFiles),
                chunkFileNames: createStableFileNames(configured.chunkFileNames, 'assets/[name].js'),
                entryFileNames: createStableFileNames(configured.entryFileNames, '[name]'),
                format: 'es',
                minify: true,
                sourcemap: false
            })

            rolldownOptions.experimental ??= {}
            rolldownOptions.experimental.devMode = {
                ...(typeof rolldownOptions.experimental.devMode === 'object'
                    ? rolldownOptions.experimental.devMode
                    : {}),
                implement: await bundleRuntimeSource(),
                lazy: false
            }
            rolldownOptions.plugins = [rolldownOptions.plugins, createViteReporter(server)]
            disableViteOxcSourcemap(rolldownOptions.plugins)
            return rolldownOptions
        }
    }
}

/** The bound HTTP port, or undefined before Vite's server is listening. */
function boundPort(server: ViteDevServer): number | undefined {
    const httpServer = server.httpServer
    if (!httpServer) {
        return undefined
    }
    const address = httpServer.address()
    if (!address || typeof address === 'string') {
        return undefined
    }
    return address.port
}

/** Writes the immutable App metadata every full build starts from. */
async function writeHmrInfo(server: ViteDevServer, buildId: string): Promise<void> {
    try {
        const port = boundPort(server)
        if (port === undefined) {
            // Port not bound yet (initial build); the listening listener writes the file.
            return
        }

        const info: HmrInfo = {
            buildId,
            endpoint: `${server.config.server.https ? 'https' : 'http'}://${resolveEndpointHost(server)}:${port}${hmrControlPath}`
        }

        await writeHmrFile(server.config.build.outDir, hmrInfoFileName, renderHmrInfo(info))

        // Pages require hmr/patches.js at boot, so the file must exist before the first publish.
        await writeHmrFile(server.config.build.outDir, hmrPatchesFileName, renderInitialHmrPatches())
    } catch (e) {
        logWxError(server.config.logger, 'wx HMR write failed', e)
    }
}

/** Logs an error with the plugin prefix, distinguishing Error values from unknowns. */
function logWxError(logger: ViteDevServer['config']['logger'], prefix: string, error: unknown): void {
    if (Error.isError(error)) {
        logger.error(`[vite-plugin-taro] ${prefix}`, { error })
    } else {
        logger.error(`[vite-plugin-taro] ${prefix} with unknown error: ${error}`)
    }
}

/** Bundles the runtime host and state machine into one plain script for injection. */
async function bundleRuntimeSource(): Promise<string> {
    const result = await build({
        input: resolvePackageFile('dist/runtime/wx/dev/dev-runtime.js'),
        output: { format: 'iife', minify: true, sourcemap: false }
    })
    return result.output[0].code
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
 * Prepends entry banners. Banners are plain text appended after Rolldown's analysis, so the
 * requires never become chunk dependencies (a bare require inside the injected runtime source
 * would stall the build), and the wx render pipeline keeps this text after the hoisted chunk
 * requires — so the runtime chunk exists before these run:
 * - the app entry loads hmr/info.js and initializes the runtime before any module registers;
 * - every page requires hmr/patches.js, the changed dependency that makes DevTools re-execute
 *   live Pages and thereby load physical updates.
 */
function createEntryBanner(pageFiles: ReadonlySet<string>): (chunk: { name: string; fileName: string }) => string {
    return (chunk) => {
        if (chunk.name === appShellFileName) {
            return "__rolldown_runtime__.initialize(require('./hmr/info.js'));\n"
        }
        if (pageFiles.has(chunk.name)) {
            // Page files live at `pages/<route>/index.js`, so the dependency path must be
            // computed relative to each page's own directory.
            const patchesPath = path.posix.relative(path.posix.dirname(chunk.fileName), 'hmr/patches.js')
            return `require('${patchesPath}');\n`
        }
        return ''
    }
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
