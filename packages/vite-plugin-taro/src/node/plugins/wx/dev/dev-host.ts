import type { ServerResponse } from 'node:http'
import path from 'node:path'
import colors from 'picocolors'
import type { InputOptions, OutputOptions, Plugin } from 'rolldown'
import { build } from 'rolldown'
import { type DevEngine, dev, viteReporterPlugin } from 'rolldown/experimental'
import type { Connect, ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { once } from '../../../utils/once.ts'
import { resolvePackageFile } from '../../../utils/packages.ts'
import { appShellFileName } from '../module.ts'
import { createWxDevMode } from './create-wx-dev-mode.ts'
import { emptyOutputDirectory } from './empty-output-directory.ts'
import {
    type HmrInfo,
    hmrControlPath,
    hmrInfoFileName,
    hmrPatchesFileName,
    type PatchUpdate,
    renderHmrInfo,
    renderInitialHmrPatches,
    writeHmrFile
} from './hmr-files.ts'
import { PatchPublisher } from './patch-publisher.ts'

export type WxDevHost = Readonly<{
    close: () => Promise<void>
}>

type DeliveryReport = Readonly<{
    kind: 'delivery'
    buildId: string
    seq: number
}>

/** The runtime hit an unrecoverable state (e.g. a corrupted patch range) and needs a full rebuild. */
type RebuildReport = Readonly<{
    kind: 'rebuild'
    buildId: string
}>

/**
 * Creates the wx dev host: the adapter that owns the physical Rolldown DevEngine (created
 * with dev(...)) and the patch publisher, and replaces Vite's bundledDev.listen so the
 * engine writes directly to the Mini Program output directory instead of serving browser
 * HMR over HTTP.
 */
export async function createWxDevHost({
    server,
    options
}: {
    server: ViteDevServer
    options: VitePluginTaroOptions
}): Promise<WxDevHost> {
    const bundledDev = getBundledDev(server)
    // DevEngine does not reject run() after an initial plugin failure, so settle startup from its first buildEnd result.
    // Later build errors belong to the running server and continue through onOutput/onHmrUpdates.
    const initialBuild = Promise.withResolvers<void>()
    const settleInitialBuild = once((error: Error | undefined): void => {
        if (error) {
            initialBuild.reject(error)
        } else {
            initialBuild.resolve()
        }
    })

    const publisher = new PatchPublisher((content) =>
        writeHmrFile(server.config.build.outDir, hmrPatchesFileName, content)
    )

    // Must install rolldown options before create engine
    installRolldownOptions()
    const engine: DevEngine = await createEngine()

    // The wx dev host owns the only DevEngine. Vite's default listen() would create a second
    // skip-write engine that renders into memory for browser HMR; instead the physical
    // engine's initial build must finish before the HTTP server becomes ready, because
    // DevTools opens the output directory directly and the app requires its files on disk.
    bundledDev._devEngine = engine
    bundledDev.triggerBundleRegenerationIfStale = async () => false
    bundledDev.listen = async () => {
        await Promise.all([engine.run(), initialBuild.promise])
        await engine.ensureCurrentBuildFinish()
    }

    // Vite binds the port only after initServer (and therefore the initial build) completes, so
    // the actual port is not observable while onOutput runs for the first build. The App metadata
    // is written once the port is real; later full builds rewrite it from onOutput.
    server.httpServer?.once('listening', startFreshBuild)

    // The runtime's metadata-only reports land on the control path; the buildId in each report
    // IS the Rolldown client ID.
    server.middlewares.use(hmrControlPath, (req, res) => void handleReport(req, res))

    // Append the DevTools project directory line after Vite's own startup banner: DevTools
    // opens the output directory directly, so the printed path is the one to select.
    const originalPrintUrls = server.printUrls.bind(server)
    server.printUrls = () => {
        originalPrintUrls()
        server.config.logger.info(
            `  ${colors.green('➜')}  ${colors.bold('WeChat DevTools')}: ${colors.cyan(relativeToViteConfig(server.config.build.outDir, server.config.configFile, server.config.root))}`
        )
    }

    return {
        close: async () => {
            await engine.close()
        }
    }

    /** Rotates the build identity and materializes the App metadata for it. */
    async function startFreshBuild(): Promise<void> {
        const port = boundPort(server)
        if (port === undefined) {
            // The initial output finishes before Vite binds its port. The listening listener
            // starts the first real client build, avoiding a phantom registered client.
            return
        }

        const { buildId, previousBuildId } = publisher.startBuild()
        if (previousBuildId) {
            await engine.removeClient(previousBuildId)
        }
        await engine.registerClient(buildId)

        // Publish info last: a heap that observes the new identity is guaranteed to see the
        // matching reset patch file.
        await writeHmrFile(server.config.build.outDir, hmrPatchesFileName, renderInitialHmrPatches())
        await writeHmrInfo(server, buildId, port)
    }

    async function handleReport(req: Connect.IncomingMessage, res: ServerResponse): Promise<void> {
        if (req.method !== 'POST') {
            res.statusCode = 404
            res.end()
            return
        }

        try {
            const report = JSON.parse(await readBody(req)) as DeliveryReport | RebuildReport
            // Only the current build's reports can advance physical delivery;
            // delayed reports from older builds are ignored so they can never influence the
            // live build.
            if (!publisher.isCurrentBuild(report.buildId)) {
                res.end()
                return
            }
            if (report.kind === 'rebuild') {
                engine.triggerFullBuild()
                res.end()
                return
            }
            // Commit every newly acknowledged Rolldown payload to this client's ship map.
            const deliveredFiles = publisher.acknowledge(report.seq)
            await Promise.all(deliveredFiles.map((fileName) => engine.notifyPayloadDelivered(fileName)))
            res.end()
        } catch (e) {
            logWxError(server.config.logger, 'wx HMR report failed', e)
            res.statusCode = 400
            res.end()
        }
    }

    /** Creates the physical DevEngine with the wx dev host hooks. */
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
                // Collect the current client's batch first: one HMR event can carry several
                // client envelopes, while only the active build may enter its patch history.
                const batch: PatchUpdate[] = []
                for (const { clientId, update } of result.updates) {
                    // Removed and delayed client sessions can still appear in a completed
                    // engine batch; they must never enter the current build's patch history.
                    if (!publisher.isCurrentBuild(clientId) || update.type === 'Noop') {
                        continue
                    }
                    if (update.type === 'Patch') {
                        batch.push(update)
                        continue
                    }

                    server.config.logger.info(
                        `[vpt] wx full rebuild required${update.reason ? `: ${update.reason}` : ''}`
                    )
                    engine.triggerFullBuild()
                    return
                }
                if (batch.length > 0) {
                    await publisher.produce(batch)
                    // server.config.logger.info('[vpt] wx patch produced')
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
            rolldownOptions.experimental.devMode = createWxDevMode(
                rolldownOptions.experimental.devMode,
                await bundleRuntimeSource()
            )

            const emptyOutputDirectoryPlugin: Plugin = {
                name: 'vpt:wx-empty-output-directory',
                renderStart: {
                    order: 'pre',
                    // DevEngine bypasses Vite's build-only output preparation. Clear stale files before every complete
                    // physical render while retaining the directory watched by WeChat DevTools.
                    handler: () => emptyOutputDirectory(server.config.build.outDir)
                }
            }
            const reportInitialBuildPlugin: Plugin = {
                name: 'vpt:wx-report-initial-build',
                buildEnd: settleInitialBuild
            }

            rolldownOptions.plugins = [
                emptyOutputDirectoryPlugin,
                rolldownOptions.plugins,
                reportInitialBuildPlugin,
                createViteReporter(server)
            ]
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
async function writeHmrInfo(server: ViteDevServer, buildId: string, port: number): Promise<void> {
    const info: HmrInfo = {
        buildId,
        endpoint: `${server.config.server.https ? 'https' : 'http'}://${resolveEndpointHost(server)}:${port}${hmrControlPath}`
    }

    await writeHmrFile(server.config.build.outDir, hmrInfoFileName, renderHmrInfo(info))
}

/**
 * The project directory shown in the DevTools banner, relative to the Vite config:
 * `dist/wx` instead of the absolute output path, so it can be pasted into DevTools.
 */
function relativeToViteConfig(outDir: string, configFile: string | undefined, root: string): string {
    const configDirectory = configFile ? path.dirname(configFile) : root
    const relativePath = path.relative(configDirectory, outDir).replaceAll('\\', '/')
    if (!relativePath) return '.'
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

/** Logs an error with the plugin prefix, distinguishing Error values from unknowns. */
function logWxError(logger: ViteDevServer['config']['logger'], prefix: string, error: unknown): void {
    if (Error.isError(error)) {
        logger.error(`[vpt] ${prefix}`, { error })
    } else {
        logger.error(`[vpt] ${prefix} with unknown error: ${error}`)
    }
}

// The runtime source is immutable for the host's lifetime (it changes only when the
// plugin is rebuilt), so the nested bundle runs once and every build reuses it.
const bundleRuntimeSource = once(
    /** Bundles the runtime host and state machine into one plain script for injection. */
    async function bundleRuntimeSource(): Promise<string> {
        // write: false — only the code is consumed; without it rolldown drops the bundle into
        // the default dist/ of the running project.
        const result = await build({
            input: resolvePackageFile('dist/runtime/wx/dev/dev-runtime.js'),
            output: { format: 'iife', minify: true, sourcemap: false },
            write: false
        })
        return result.output[0].code
    }
)

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
