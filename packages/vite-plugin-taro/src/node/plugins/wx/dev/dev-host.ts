import type { ServerResponse } from 'node:http'
import path from 'node:path'
import colors from 'picocolors'
import { type DevEngine, type DevOptions, dev } from 'rolldown/experimental'
import type { Connect, ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { SerializedTaskQueue } from '../../../utils/serialized-task-queue.ts'
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
import { createStyleCapturePlugin, type ProcessedStyle } from './styles/create-style-capture-plugin.ts'
import { type BundledDev, installWxDevOptions, requireSingleOutput } from './wx-dev-options.ts'

export type WxDevHost = Readonly<{
    close: () => Promise<void>
}>

type AppliedReport = Readonly<{
    kind: 'applied'
    buildId: string
    seq: number
}>

/** The runtime hit an unrecoverable state (e.g. a corrupted patch range) and needs a full rebuild. */
type RebuildReport = Readonly<{
    kind: 'rebuild'
    buildId: string
    reason: string
}>

type HmrReport = AppliedReport | RebuildReport
type HmrUpdatesResult = Parameters<NonNullable<DevOptions['onHmrUpdates']>>[0]
type HmrUpdates = Exclude<HmrUpdatesResult, Error>
type DevOutputResult = Parameters<NonNullable<DevOptions['onOutput']>>[0]

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
    // The host owns processed development CSS that Rolldown's graph does not retain. The trailing capture hook updates one
    // immutable value per physical style in O(1), ready for graph composition at the HMR transaction boundary.
    const processedStyles = new Map<string, ProcessedStyle>()
    const styleCapturePlugin = createStyleCapturePlugin((id, style) => {
        processedStyles.set(id, style)
    })

    // Rolldown invokes output callbacks without awaiting their promises. This queue is the single owner of mutable HMR host
    // state and physical metadata writes, preventing a later patch or build identity from being overwritten by older work.
    const hostTasks = new SerializedTaskQueue((operation, error) => logWxError(server.config.logger, operation, error))

    const publisher = new PatchPublisher((content) =>
        writeHmrFile(server.config.build.outDir, hmrPatchesFileName, content)
    )

    // DevEngine does not reject run() after an initial plugin failure. The options layer owns a first-build buildEnd barrier
    // and exposes only its result; later build errors continue independently through onOutput and onHmrUpdates.
    const initialBuild = installWxDevOptions({ bundledDev, server, options, hostPlugins: [styleCapturePlugin] })
    const engine: DevEngine = await createEngine()

    // The wx dev host owns the only DevEngine. Vite's default listen() would create a second
    // skip-write engine that renders into memory for browser HMR; instead the physical
    // engine's initial build must finish before the HTTP server becomes ready, because
    // DevTools opens the output directory directly and the app requires its files on disk.
    bundledDev._devEngine = engine
    bundledDev.triggerBundleRegenerationIfStale = async () => false
    bundledDev.listen = async () => {
        await Promise.all([engine.run(), initialBuild])
        await engine.ensureCurrentBuildFinish()
    }

    // Vite binds the port only after initServer (and therefore the initial build) completes, so
    // the actual port is not observable while onOutput runs for the first build. The App metadata
    // is written once the port is real; later full builds rewrite it from onOutput.
    server.httpServer?.once('listening', () => {
        hostTasks.enqueue('wx HMR initialization failed', rotateBuildSession)
    })

    // The runtime's metadata-only reports land on the control path; the buildId in each report
    // IS the Rolldown client ID.
    server.middlewares.use(hmrControlPath, (req, res) => void handleReport(req, res))

    installDevToolsPrinter(server)

    return {
        close: async () => {
            await hostTasks.waitForIdle()
            await engine.close()
        }
    }

    /** Rotates the build identity and materializes the App metadata for it. */
    async function rotateBuildSession(): Promise<void> {
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

        await publishBuildMetadata(server, buildId, port)
    }

    async function handleReport(req: Connect.IncomingMessage, res: ServerResponse): Promise<void> {
        if (req.method !== 'POST') {
            res.statusCode = 404
            res.end()
            return
        }

        try {
            const report = JSON.parse(await readBody(req)) as HmrReport
            await hostTasks.run(() => processReport(report))
            res.end()
        } catch (e) {
            logWxError(server.config.logger, 'wx HMR report failed', e)
            res.statusCode = 400
            res.end()
        }
    }

    /** Applies one runtime receipt to the active physical patch history. */
    function processReport(report: HmrReport): void {
        // Delayed reports from older builds must never prune the live build's cumulative patch history.
        if (!publisher.isCurrentBuild(report.buildId)) {
            return
        }

        switch (report.kind) {
            case 'rebuild': {
                server.config.logger.info(`[vpt] wx runtime requested a full rebuild: ${report.reason}`)
                engine.triggerFullBuild()
                return
            }
            case 'applied': {
                publisher.acknowledge(report.seq)
                return
            }
        }
    }

    /** Creates the physical DevEngine with the wx dev host hooks. */
    async function createEngine(): Promise<DevEngine> {
        const rolldownOptions = await bundledDev.getRolldownOptions()
        const output = requireSingleOutput(rolldownOptions)

        return dev(rolldownOptions, output, {
            onHmrUpdates: handleHmrUpdates,
            onOutput: handleDevOutput,
            rebuildStrategy: 'never',
            watch: { skipWrite: false }
        })
    }

    /** Converts Rolldown's non-awaited callback into one ordered host publication task. */
    function handleHmrUpdates(result: HmrUpdatesResult): void {
        if (result instanceof Error) {
            logWxError(server.config.logger, 'wx HMR update failed', result)
            return
        }
        hostTasks.enqueue('wx HMR publication failed', () => publishUpdates(result))
    }

    /** Publishes only the active client's patches or requests the complete build required by Rolldown. */
    async function publishUpdates(result: HmrUpdates): Promise<void> {
        const batch: PatchUpdate[] = []
        for (const { clientId, update } of result.updates) {
            if (!publisher.isCurrentBuild(clientId) || update.type === 'Noop') {
                continue
            }

            if (update.type === 'Patch') {
                batch.push(update)
                continue
            }

            server.config.logger.info(`[vpt] wx full rebuild required${update.reason ? `: ${update.reason}` : ''}`)
            engine.triggerFullBuild()
            return
        }

        if (batch.length === 0) {
            return
        }

        // The physical file must exist before Rolldown advances: once committed, later patches may be generated relative to
        // this batch even if DevTools has not observed its file event yet. PatchPublisher keeps the unapplied range cumulative,
        // so any later file generation still carries every factory needed to bridge the runtime's older application frontier.
        await publisher.produce(batch)

        await commitPublishedBatch(batch)
    }

    /**
     * Advances Rolldown's published frontier in the same sequence order materialized in the cumulative physical file.
     *
     * Given a batch [5, 6], publisher.produce has already made factories [5, 6] visible in hmr/patches.js. This method then
     * commits payload 5 followed by payload 6. If DevTools observes neither event before sequence 7 is published, the next
     * physical file contains [5, 6, 7], while Rolldown is free to generate 7 relative to its already-published sequence 6.
     */
    async function commitPublishedBatch(batch: readonly PatchUpdate[]): Promise<void> {
        // Do not use Promise.all or deduplicate filenames. Multiple sequential payloads may target the same output filename,
        // and each notification commits one distinct Rolldown payload. Awaiting in order preserves the exact frontier encoded
        // by PatchUpdate.seq and prevents a later payload from becoming visible to the engine before its predecessor.
        for (const patch of batch) {
            await engine.notifyPayloadDelivered(patch.filename)
        }
    }

    /** Rotates metadata after each successful complete output. */
    function handleDevOutput(result: DevOutputResult): void {
        if (result instanceof Error) {
            logWxError(server.config.logger, 'wx dev build failed', result)
            return
        }
        hostTasks.enqueue('wx dev build finalization failed', rotateBuildSession)
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

/** Resets physical patches before exposing the matching immutable build identity to a new App heap. */
async function publishBuildMetadata(server: ViteDevServer, buildId: string, port: number): Promise<void> {
    const info: HmrInfo = {
        buildId,
        endpoint: `${server.config.server.https ? 'https' : 'http'}://${resolveEndpointHost(server)}:${port}${hmrControlPath}`
    }

    await writeHmrFile(server.config.build.outDir, hmrPatchesFileName, renderInitialHmrPatches())
    await writeHmrFile(server.config.build.outDir, hmrInfoFileName, renderHmrInfo(info))
}

/** Replaces browser server URLs with the physical project directory consumed by WeChat DevTools. */
function installDevToolsPrinter(server: ViteDevServer): void {
    server.printUrls = () => {
        server.config.logger.info(
            `  ${colors.green('➜')}  ${colors.bold('WeChat DevTools')}: ${colors.cyan(relativeToViteConfig(server.config.build.outDir, server.config.configFile, server.config.root))}`
        )
    }
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

function getBundledDev(server: ViteDevServer): BundledDev {
    const bundledDev = server.environments.client.bundledDev as unknown as BundledDev | undefined
    if (!bundledDev) {
        throw new Error('Vite did not create the wx bundled-development environment.')
    }
    return bundledDev
}
