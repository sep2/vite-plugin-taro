import { readFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import colors from 'picocolors'
import { type DevEngine, type DevOptions, dev } from 'rolldown/experimental'
import { asyncScheduler } from 'rxjs'
import type { Connect, ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { createHmrResultsStream } from './create-hmr-results-stream.ts'
import {
    developmentAppWxssFileName,
    globalWxssFileName,
    type HmrInfo,
    hmrControlPath,
    hmrInfoFileName,
    hmrPatchesFileName,
    type PatchUpdate,
    renderDevelopmentAppWxss,
    renderHmrInfo,
    renderInitialHmrPatches,
    writeHmrFile
} from './hmr-files.ts'
import { createHostActions } from './host-actions.ts'
import { PatchPublisher } from './patch-publisher.ts'
import { createRuntimeReportsStream, type RuntimeReport } from './runtime-reports.ts'
import { createStyleCapture, type StyleCaptureAction } from './styles/create-style-capture.ts'
import { type BundledDev, installWxDevOptions, requireSingleOutput } from './wx-dev-options.ts'

export type WxDevHost = Readonly<{
    close: () => Promise<void>
}>

type HmrUpdatesResult = Parameters<NonNullable<DevOptions['onHmrUpdates']>>[0]
type HmrUpdates = Exclude<HmrUpdatesResult, Error>
type DevOutputResult = Parameters<NonNullable<DevOptions['onOutput']>>[0]
/** A complete build callback is a host action whether it carries durable output or an initial/later build failure. */
type OutputAction = Readonly<{ kind: 'output'; result: DevOutputResult }>

type HostAction =
    | StyleCaptureAction
    | Readonly<{ kind: 'publish'; result: HmrUpdates }>
    | Readonly<{ kind: 'error'; error: Error }>
    | Readonly<{ kind: 'reports'; reports: readonly RuntimeReport[] }>
    | OutputAction
    | Readonly<{ kind: 'listening' }>

/** One short trailing-edge window absorbs editor bursts before style preparation and physical Page notification. */
const hmrSettleMilliseconds = 32

/**
 * Creates the wx dev host: the adapter that owns the physical Rolldown DevEngine (created
 * with dev(...)) and the patch publisher, and replaces Vite's bundledDev.listen so the
 * engine writes directly to the Mini Program output directory instead of serving browser
 * HMR over HTTP.
 *
 * `applicationEntryIds` is the resolver's immutable cascade policy, not a second graph: it selects the App capsule followed
 * by configured Page capsules from Rolldown's larger entry set. Rolldown remains the authority for every live import edge.
 */
export async function createWxDevHost({
    server,
    options,
    applicationEntryIds
}: {
    server: ViteDevServer
    options: VitePluginTaroOptions
    applicationEntryIds: readonly string[]
}): Promise<WxDevHost> {
    const bundledDev = getBundledDev(server)

    // All callbacks admit typed actions through this edge; concatMap is the sole owner of effect ordering and mutable host state.
    const hostActions = createHostActions<HostAction>(applyHostAction, (action, error) =>
        logWxError(server.config.logger, `wx HMR ${action.kind} failed`, error)
    )

    const styleCapture = createStyleCapture({
        applicationEntryIds: applicationEntryIds,
        outDir: server.config.build.outDir,
        // Capture hooks run only after engine.run, when the host action subscription and all reducer dependencies are ready.
        emit: (action) => hostActions.next(action),
        transformTailwindRoot: async (rootId, requestId) =>
            server.environments.client.pluginContainer.transform(await readFile(rootId, 'utf8'), requestId)
    })
    const publisher = new PatchPublisher((content) =>
        writeHmrFile(server.config.build.outDir, hmrPatchesFileName, content)
    )

    // Option installation now configures only Rolldown. Build lifecycle results enter through the engine's output action below.
    installWxDevOptions({ bundledDev, server, options, hostPlugins: [styleCapture.plugin] })
    const engine: DevEngine = await createEngine()

    const hmrResults = createHmrResultsStream(
        hmrSettleMilliseconds,
        asyncScheduler,
        (result) => {
            // One reduced window becomes one existing host transaction: style preparation, one cumulative patch write, then
            // ordered delivery notifications for every original Rolldown payload retained by the stream.
            hostActions.next({ kind: 'publish', result: result })
        },
        (error) => {
            /*
             * Invalid syntax is a normal intermediate editor generation. Rolldown produced no patch, so neither the published
             * nor applied runtime frontier needs repair. Triggering a complete build here would immediately compile the same
             * invalid source and empirically wedges that DevEngine generation. Admit only the diagnostic; when the user saves
             * valid source, the watch engine emits an ordinary successful callback and resumes the normal publication path.
             */
            hostActions.next({ kind: 'error', error: error })
        }
    )

    const runtimeReports = createRuntimeReportsStream(hmrSettleMilliseconds, asyncScheduler, (reports) => {
        // ACK conflation happens before admission, but publisher validation and mutation remain ordered with patch writes and
        // build rotation. Reports arriving during publication therefore execute only after that physical transaction commits.
        hostActions.next({ kind: 'reports', reports: reports })
    })
    // The wx dev host owns the only DevEngine. Vite's default listen() would create a second
    // skip-write engine that renders into memory for browser HMR; instead the physical
    // engine's initial build must finish before the HTTP server becomes ready, because
    // DevTools opens the output directory directly and the app requires its files on disk.
    bundledDev._devEngine = engine
    bundledDev.triggerBundleRegenerationIfStale = async () => false
    bundledDev.listen = async () => {
        /*
         * Subscribe before run because DevEngine intentionally fulfills run() after an initial plugin failure and emits that
         * Error through onOutput. Observing the existing action edge preserves the exact failure without a second buildEnd
         * Promise or forwarding Subject; waitForAction does not consume the action from concatMap's reducer subscription.
         */
        const initialOutput = hostActions.waitForAction((action): action is OutputAction => action.kind === 'output')
        await engine.run()
        const { result } = await initialOutput
        if (result instanceof Error) {
            throw result
        }
        await engine.ensureCurrentBuildFinish()
    }

    // Vite binds the port only after initServer (and therefore the initial build) completes, so
    // the actual port is not observable while onOutput runs for the first build. The App metadata
    // is written once the port is real; later full builds rewrite it from onOutput.
    server.httpServer?.once('listening', () => {
        // Port availability is lifecycle data, so initial identity rotation follows prior output/capture actions in the reducer.
        hostActions.next({ kind: 'listening' })
    })

    // The runtime's metadata-only reports land on the control path; the buildId in each report
    // IS the Rolldown client ID.
    server.middlewares.use(hmrControlPath, (req, res) => void handleReport(req, res))

    installDevToolsPrinter(server)

    return {
        close: async () => {
            // Quiet-window completion first admits final HMR publications and rebuild reports into the serialized action edge.
            hmrResults.complete()
            runtimeReports.complete()
            await hostActions.waitForIdle()
            // Keep the action edge open until the final generation has admitted all capture and output callbacks.
            await engine.ensureCurrentBuildFinish()
            await hostActions.complete()
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
            const report = JSON.parse(await readBody(req)) as RuntimeReport
            runtimeReports.next(report)
            res.end()
        } catch (e) {
            logWxError(server.config.logger, 'wx HMR report failed', e)
            res.statusCode = 400
            res.end()
        }
    }

    /** Reduces one merged source action through the existing authoritative host state. */
    function applyHostAction(action: HostAction): void | Promise<void> {
        switch (action.kind) {
            case 'capture-graph':
                // The buildStart reader is a live capability; replacing it only here makes the reducer own build rebinding.
                styleCapture.captureGraph(action.getModuleInfo)
                return
            case 'capture-style':
                // A failed upstream transform emits no action, intentionally retaining the last valid processed CSS generation.
                styleCapture.captureStyle(action.id, action.style)
                return
            case 'publish':
                return publishUpdates(action.result)
            case 'error':
                logWxError(server.config.logger, 'wx HMR update failed', action.error)
                return
            case 'reports':
                action.reports.forEach(processReport)
                return
            case 'output':
                if (action.result instanceof Error) {
                    logWxError(server.config.logger, 'wx dev build failed', action.result)
                    return
                }
                return finalizeDevOutput()
            case 'listening':
                return rotateBuildSession()
        }
    }

    /** Applies one runtime receipt to the active physical patch history. */
    function processReport(report: RuntimeReport): void {
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
            /**
             * Admits Rolldown's non-awaited callback without starting asynchronous host work on the binding callback stack.
             * The Subject retains Error values as control events and successful values as lossless patch data until its quiet edge.
             */
            onHmrUpdates: (result: HmrUpdatesResult) => {
                hmrResults.next(result)
            },
            // Initial and later complete builds share one admission path; startup merely observes the first OutputAction.
            onOutput: (result: DevOutputResult) => {
                hostActions.next({ kind: 'output', result: result })
            },
            rebuildStrategy: 'never',
            watch: {
                // Rolldown must observe every source generation and emit every incremental factory: later patches do not
                // reconstruct modules changed only by an earlier callback. RxJS conflates publication after compilation,
                // preserving the complete patch sequence while avoiding repeated physical DevTools notifications.
                skipWrite: false,
                useDebounce: false
            }
        })
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

        // `onHmrUpdates` is the transaction boundary after every affected transform has updated graph and candidate state.
        // Every non-CSS edit may alter imports or Tailwind classes; rendering broadly and comparing finalized bytes avoids
        // source scanning while preventing unrelated JavaScript edits from notifying DevTools through an identical rename.
        await styleCapture.publishChanged(batch.flatMap((patch) => patch.changedIds))

        // Publish global.wxss before the matching JavaScript patch so DevTools observes a coherent HMR transaction.
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

    /** Rebinds the byte frontier after a complete build replaces or preserves the physical stylesheet. */
    async function finalizeDevOutput(): Promise<void> {
        // The style finalizer emits changed CSS but intentionally omits unchanged CSS after its first output. In both cases the
        // physical file is authoritative, so seeding its bytes is enough; no graph walk, Tailwind transform, or rewrite belongs
        // on the complete-build path.
        styleCapture.bindPublishedWxss(
            await readFile(path.join(server.config.build.outDir, globalWxssFileName), 'utf8')
        )
        await rotateBuildSession()
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

/** Resets physical patches and then exposes one coherent build identity to a freshly compiled App heap. */
async function publishBuildMetadata(server: ViteDevServer, buildId: string, port: number): Promise<void> {
    const info: HmrInfo = {
        buildId,
        endpoint: `${server.config.server.https ? 'https' : 'http'}://${resolveEndpointHost(server)}:${port}${hmrControlPath}`
    }

    await writeHmrFile(server.config.build.outDir, hmrPatchesFileName, renderInitialHmrPatches())
    await writeHmrFile(server.config.build.outDir, hmrInfoFileName, renderHmrInfo(info))
    // `removeDevelopmentAppWxss` kept the previous physical wrapper in place while the complete output was written. Replace
    // it only now, after the empty patch frontier and matching identity are durable. DevTools treats `app.wxss` as an App root,
    // so this write intentionally causes the one full refresh allowed at a complete-build boundary; the refreshed App reads
    // the new info above. Incremental updates must never write this file because an App refresh could destroy the heap while
    // its JavaScript patch is being acknowledged. They publish only the imported `assets/global.wxss` stylesheet instead.
    await writeHmrFile(server.config.build.outDir, developmentAppWxssFileName, renderDevelopmentAppWxss(buildId))
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
