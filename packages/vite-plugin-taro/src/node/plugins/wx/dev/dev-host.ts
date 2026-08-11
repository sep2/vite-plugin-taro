import { readFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import colors from 'picocolors'
import type { GetModuleInfo } from 'rolldown'
import { type DevEngine, type DevOptions, dev } from 'rolldown/experimental'
import { asyncScheduler, Subject } from 'rxjs'
import { type Connect, isCSSRequest, type ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { SerializedTaskQueue } from '../../../utils/serialized-task-queue.ts'
import { createGraphStylePlan, isGlobalStyleRequest } from '../styles/utils.ts'
import { createHmrResultsStream } from './create-hmr-results-stream.ts'
import {
    developmentAppWxssFileName,
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
import { PatchPublisher } from './patch-publisher.ts'
import { createRuntimeReportsStream, type RuntimeReport } from './runtime-reports.ts'
import { createStyleCapturePlugin, type ProcessedStyle } from './styles/create-style-capture-plugin.ts'
import { globalWxssFileName, publishStyleHmr, refreshTailwindStyles } from './styles/publish-style-hmr.ts'
import { type BundledDev, installWxDevOptions, requireSingleOutput } from './wx-dev-options.ts'

export type WxDevHost = Readonly<{
    close: () => Promise<void>
}>

type HmrUpdatesResult = Parameters<NonNullable<DevOptions['onHmrUpdates']>>[0]
type HmrUpdates = Exclude<HmrUpdatesResult, Error>
type DevOutputResult = Parameters<NonNullable<DevOptions['onOutput']>>[0]
type StyleCaptureAction =
    | Readonly<{ kind: 'capture-graph'; getModuleInfo: GetModuleInfo }>
    | Readonly<{ kind: 'capture-style'; id: string; style: ProcessedStyle }>

type HostAction =
    | StyleCaptureAction
    | Readonly<{ kind: 'publish'; result: HmrUpdates }>
    | Readonly<{ kind: 'error'; error: Error }>
    | Readonly<{ kind: 'reports'; reports: readonly RuntimeReport[] }>
    | Readonly<{ kind: 'output'; result: DevOutputResult }>

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
    // Plugin hooks emit captures synchronously into this hot source instead of mutating host state from Rolldown's callback
    // stack. Its subscription is installed before engine.run, so buildStart/transform emission order becomes host action order.
    const styleCaptures = new Subject<StyleCaptureAction>()
    // This is the host's mutable style projection: CSS absent from Rolldown, the live graph capability rebound by each
    // complete build, and the last durable WXSS bytes used only to suppress identical filesystem publications. Style capture
    // remains O(1); derived order and reachability stay local to each HMR transaction.
    const styleState: {
        getModuleInfo: GetModuleInfo | undefined
        processedStyles: Map<string, ProcessedStyle>
        publishedWxss: string | undefined
    } = {
        getModuleInfo: undefined,
        processedStyles: new Map(),
        publishedWxss: undefined
    }
    const styleCapturePlugin = createStyleCapturePlugin({
        captureGraph(reader) {
            styleCaptures.next({ kind: 'capture-graph', getModuleInfo: reader })
        },
        captureStyle(id, style) {
            styleCaptures.next({ kind: 'capture-style', id: id, style: style })
        }
    })

    // Rolldown invokes output callbacks without awaiting their promises. This queue is the single owner of mutable HMR host
    // state and physical metadata writes, preventing a later patch or build identity from being overwritten by older work.
    const hostTasks = new SerializedTaskQueue((operation, error) => logWxError(server.config.logger, operation, error))

    const publisher = new PatchPublisher((content) =>
        writeHmrFile(server.config.build.outDir, hmrPatchesFileName, content)
    )

    // DevEngine does not reject run() after an initial plugin failure. The options layer owns a first-build buildEnd barrier
    // and exposes only its result; later build errors continue independently through the host streams below.
    const initialBuild = installWxDevOptions({ bundledDev, server, options, hostPlugins: [styleCapturePlugin] })
    // This hot Subject is the only admission edge for non-awaited complete-output callbacks. It owns no build state; completion
    // and errors become ordinary host actions whose effects remain serialized with patch and report transactions.
    const buildOutputs = new Subject<DevOutputResult>()
    const engine: DevEngine = await createEngine()

    // Migrated sources reduce independently, then merge into this single semantic action edge. Its sole subscription sends
    // actions through applyHostAction on hostTasks, preserving one state reducer and physical writer until lifecycle migrates.
    // Source subscriptions therefore never mutate PatchPublisher, style state, or DevEngine directly.
    const hostActions = new Subject<HostAction>()
    hostActions.subscribe((action) => {
        hostTasks.enqueue(`wx HMR ${action.kind} failed`, () => applyHostAction(action))
    })
    styleCaptures.subscribe((action) => {
        // Capture actions share the same queue as output and HMR actions. A transform capture therefore commits before the
        // transaction callback it causally precedes, without plugin hooks directly touching the mutable style projection.
        hostActions.next(action)
    })

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
    buildOutputs.subscribe((result) => {
        // Do not finalize from Rolldown's callback stack. One output action rotates the session only after every previously
        // admitted patch/report effect, and a failed output follows the same ordering without mutating build identity.
        hostActions.next({ kind: 'output', result: result })
    })

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
            /*
             * First flush callback/report windows and execute their admitted actions while buildOutputs stays open: a final
             * runtime report can request a complete build. Then wait for that DevEngine generation, whose non-awaited onOutput
             * callback synchronously admits its output action. Only after that source is quiescent may the merged action edge
             * complete. The second queue wait includes output finalization before engine.close releases Rolldown resources.
             */
            hmrResults.complete()
            runtimeReports.complete()
            await hostTasks.waitForIdle()
            await engine.ensureCurrentBuildFinish()
            // A final complete generation emits graph/style captures before onOutput, so both sources stay open through ensure.
            styleCaptures.complete()
            buildOutputs.complete()
            hostActions.complete()
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
                styleState.getModuleInfo = action.getModuleInfo
                return
            case 'capture-style':
                // A failed upstream transform emits no action, intentionally retaining the last valid processed CSS generation.
                styleState.processedStyles.set(action.id, action.style)
                return
            case 'publish':
                return publishUpdates(action.result)
            case 'error':
                logWxError(server.config.logger, 'wx HMR update failed', action.error)
                return
            case 'reports':
                return processReports(action.reports)
            case 'output':
                if (action.result instanceof Error) {
                    logWxError(server.config.logger, 'wx dev build failed', action.result)
                    return
                }
                return finalizeDevOutput()
        }
    }

    /** Applies one reduced receipt window to the active physical patch history. */
    function processReports(reports: readonly RuntimeReport[]): void {
        reports.forEach(processReport)
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
            // Complete outputs are source events, not permission to mutate host state on Rolldown's callback stack.
            onOutput: (result: DevOutputResult) => {
                buildOutputs.next(result)
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
        await publishChangedStyles(batch)

        // Publish global.wxss before the matching JavaScript patch so DevTools observes a coherent HMR transaction.
        // The physical file must exist before Rolldown advances: once committed, later patches may be generated relative to
        // this batch even if DevTools has not observed its file event yet. PatchPublisher keeps the unapplied range cumulative,
        // so any later file generation still carries every factory needed to bridge the runtime's older application frontier.
        await publisher.produce(batch)

        await commitPublishedBatch(batch)
    }

    /** Publishes the style projection for one completed patch transaction when its source or topology may have changed. */
    async function publishChangedStyles(batch: readonly PatchUpdate[]): Promise<void> {
        const changedIds = batch.flatMap((patch) => patch.changedIds)
        const styleChanged = changedIds.some(isGlobalStyleRequest)
        const candidatesChanged = changedIds.some((id) => !isCSSRequest(id))
        if (!styleChanged && !candidatesChanged) {
            return
        }

        // buildStart installs this reader before Rolldown can produce either a complete output or an incremental batch.
        const getModuleInfo = styleState.getModuleInfo
        if (!getModuleInfo) {
            throw new Error('WX style graph is unavailable before HMR publication')
        }
        // Traverse topology exactly once; root refresh and final rendering consume this immutable transaction plan.
        const styleIds = createGraphStylePlan(applicationEntryIds, getModuleInfo, (styleId) =>
            styleState.processedStyles.has(styleId)
        )
        if (candidatesChanged) {
            await refreshTailwindStyles(styleIds, styleState.processedStyles, async (rootId, requestId) =>
                server.environments.client.pluginContainer.transform(await readFile(rootId, 'utf8'), requestId)
            )
        }
        styleState.publishedWxss = await publishStyleHmr({
            styleIds: styleIds,
            outDir: server.config.build.outDir,
            processedStyles: styleState.processedStyles,
            publishedWxss: styleState.publishedWxss
        })
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
        styleState.publishedWxss = await readFile(path.join(server.config.build.outDir, globalWxssFileName), 'utf8')
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
