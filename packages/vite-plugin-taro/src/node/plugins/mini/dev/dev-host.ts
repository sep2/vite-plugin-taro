import path from 'node:path'
import colors from 'picocolors'
import { type DevEngine, type DevOptions, dev } from 'rolldown/experimental'
import { asyncScheduler } from 'rxjs'
import type { ViteDevServer } from 'vite'
import {
    type RuntimeControlMessage,
    type RuntimeReport,
    runtimeControlEvent,
    runtimeReportEvent
} from '../../../../runtime/wx/dev/wx-hmr-protocol.ts'
import type { MiniContract } from '../mini-contract.d.ts'
import type { MiniStylePlugin } from '../styles/plugins.ts'
import { createHmrResultsStream } from './create-hmr-results-stream.ts'
import {
    developmentAppWxssFileName,
    globalWxssFileName,
    hmrInfoFileName,
    renderDevelopmentAppWxss,
    renderHmrInfo,
    writeDevelopmentFile
} from './hmr-files.ts'
import type { MiniHmrAction, MiniHmrMode } from './hmr-mode.ts'
import { type HmrInfo, hmrEndpointPath, type PatchUpdate } from './hmr-protocol.ts'
import { createHostActions } from './host-actions.ts'
import { type BundledDev, installMiniDevOptions, requireSingleOutput } from './mini-dev-options.ts'
import { PatchJournal } from './patch-journal.ts'

declare module 'vite' {
    interface CustomEventMap {
        'vpt:wx-hmr:control': RuntimeControlMessage
        'vpt:wx-hmr:report': RuntimeReport
    }
}

export type MiniDevHost = Readonly<{
    close: () => Promise<void>
}>

type HmrUpdatesResult = Parameters<NonNullable<DevOptions['onHmrUpdates']>>[0]
type HmrUpdates = Exclude<HmrUpdatesResult, Error>
type DevOutputResult = Parameters<NonNullable<DevOptions['onOutput']>>[0]
/** A complete build callback is a host action whether it carries durable output or an initial/later build failure. */
type OutputAction = Readonly<{ kind: 'output'; result: DevOutputResult }>

type HostAction =
    | Readonly<{ kind: 'publish'; result: HmrUpdates }>
    | Readonly<{ kind: 'error'; error: Error }>
    | Readonly<{ kind: 'report'; report: RuntimeReport }>
    | OutputAction
    | Readonly<{ kind: 'listening' }>

/**
 * One frame-sized trailing edge folds an editor burst into one style/delivery transaction. The upstream result stream retains
 * every Rolldown payload in order, so settling reduces redundant physical writes without dropping factories or sequence numbers.
 */
const hmrSettleMilliseconds = 16

/**
 * Creates the Mini Program dev host: the adapter that owns the physical Rolldown DevEngine, shared patch journal, and selected mode effects.
 * It replaces Vite's browser-oriented `bundledDev.listen()` because a Mini Program cannot execute Vite's browser module graph;
 * its engine must write a complete native project while the selected mode supplies an environment-valid patch mechanism.
 *
 * The shared style plugin carries the resolver's immutable App/Page cascade policy while Rolldown remains authoritative for
 * every live import edge. Keeping those responsibilities in the same serialized host transaction prevents JavaScript factories,
 * physical WXSS, and Rolldown's published frontier from describing different source generations.
 */
export async function createMiniDevHost({
    server,
    contract,
    styles,
    hmrMode
}: {
    server: ViteDevServer
    contract: MiniContract
    styles: MiniStylePlugin
    hmrMode: MiniHmrMode
}): Promise<MiniDevHost> {
    const bundledDev = getBundledDev(server)

    // All callbacks admit typed actions through this edge; concatMap is the sole owner of effect ordering and mutable host state.
    const hostActions = createHostActions<HostAction>(applyHostAction, (action, error) =>
        logMiniError(server.config.logger, `wx HMR ${action.kind} failed`, error)
    )

    // Modes return declarative effects; this host alone owns physical writes, event dispatch, and journal publication ordering.
    const writeFile = (fileName: string, source: string) =>
        writeDevelopmentFile(server.config.build.outDir, fileName, source)

    const journal = new PatchJournal((publication) => dispatchModeAction(hmrMode.publish(publication)))

    server.ws.on(runtimeReportEvent, (report) => {
        hostActions.next({ kind: 'report', report: report })
    })

    // Option installation configures only Rolldown. Build lifecycle results enter through the engine's output action below.
    installMiniDevOptions({ bundledDev: bundledDev, server: server, contract: contract, hmrMode: hmrMode })
    const engine: DevEngine = await createEngine()

    const hmrResults = createHmrResultsStream(
        hmrSettleMilliseconds,
        asyncScheduler,
        (result) => {
            // One reduced window becomes one host transaction: style preparation, one cumulative mode publication, then ordered
            // delivery notifications for every original Rolldown payload retained by the stream. The reduction changes physical
            // write count only; notification count and order still match Rolldown's sequence frontier exactly.
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

    /*
     * BundledDev is Vite's mutable environment adapter. Transfer its engine slot to the one physical writer created above so
     * Vite middleware and close() address the same engine; leaving the slot untouched would make listen() create a second,
     * skip-write browser engine with a divergent graph. Disable Vite's access-triggered regeneration because runtime reports and
     * Rolldown HMR results now own every rebuild decision. Finally replace listen so readiness waits for physical initial output
     * instead of Vite's in-memory bundle. These assignments are installation-time ownership transfer, never per-update state.
     */
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
        // onOutput admission happens on Rolldown's callback stack, but its style publication runs asynchronously through
        // hostActions. Drain that transaction before returning control to Vite: otherwise the HTTP server can bind while the
        // initial output action is still finalizing styles, causing both that action and the later listening action to observe
        // the port and rotate the build identity twice.
        await hostActions.waitForIdle()
    }

    // Vite binds the port only after initServer (and therefore the initial build) completes, so
    // the actual port is not observable while onOutput runs for the first build. The App metadata
    // is written once the port is real; later full builds rewrite it from onOutput.
    server.httpServer?.once('listening', () => {
        // Port availability is lifecycle data, so initial identity rotation follows prior output/capture actions in the reducer.
        hostActions.next({ kind: 'listening' })
    })

    installDevToolsPrinter(server)

    return {
        close: async () => {
            // Quiet-window completion first admits final HMR publications into the serialized action edge.
            hmrResults.complete()
            await hostActions.waitForIdle()
            // Keep the action edge open until the final generation has admitted every output callback.
            await engine.ensureCurrentBuildFinish()
            await hostActions.complete()
            server.ws.send(runtimeControlEvent, { kind: 'close', reason: 'host closed' })
        }
    }

    /** Atomically materializes the style plugin's prepared global artifact. */
    async function writeGlobalStyle(wxss: string): Promise<void> {
        await writeFile(globalWxssFileName, wxss)
    }

    /** Rotates the build identity and materializes the App metadata for it. */
    async function rotateBuildSession(): Promise<void> {
        const port = boundPort(server)
        if (port === undefined) {
            // The initial output finishes before Vite binds its port. The listening listener
            // starts the first real client build, avoiding a phantom registered client.
            return
        }

        server.ws.send(runtimeControlEvent, { kind: 'close', reason: 'build replaced' })
        const { buildId, previousBuildId } = journal.startBuild()
        if (previousBuildId) {
            await engine.removeClient(previousBuildId)
        }
        await engine.registerClient(buildId)

        await publishBuildMetadata(buildId, port)
    }

    /** Executes one mode-selected physical write or broadcast through host-owned infrastructure. */
    async function dispatchModeAction(action: MiniHmrAction | undefined): Promise<void> {
        if (!action) return

        switch (action.kind) {
            case 'write':
                await writeFile(action.fileName, action.source)
                return
            case 'event':
                server.ws.send(action.event, action.data)
                return
        }
    }

    /** Exposes one complete build only after its mode reset and matching socket metadata are durable. */
    async function publishBuildMetadata(buildId: string, port: number): Promise<void> {
        const info: HmrInfo = {
            buildId: buildId,
            endpoint: createSocketEndpoint(server, port)
        }

        await dispatchModeAction(hmrMode.reset())
        await writeFile(hmrInfoFileName, renderHmrInfo(info))
        // `removeDevelopmentAppWxss` kept the previous physical wrapper in place while the complete output was written. Replace it
        // only now, after the selected mode is reset and matching identity is durable. DevTools treats `app.wxss` as an App root,
        // so this write intentionally causes the one full refresh allowed at a complete-build boundary; the refreshed App reads
        // the new info above. Incremental updates must never write this file because an App refresh could destroy the heap while
        // its JavaScript patch is being acknowledged. They publish only the imported `assets/global.wxss` stylesheet instead.
        await writeFile(developmentAppWxssFileName, renderDevelopmentAppWxss(buildId))
    }

    /** Reduces one merged source action through the existing authoritative host state. */
    function applyHostAction(action: HostAction): void | Promise<void> {
        switch (action.kind) {
            case 'publish':
                return publishUpdates(action.result)
            case 'error':
                logMiniError(server.config.logger, 'wx HMR update failed', action.error)
                return
            case 'report':
                processReport(action.report)
                return
            case 'output':
                if (action.result instanceof Error) {
                    logMiniError(server.config.logger, 'wx dev build failed', action.result)
                    return
                }
                return publishCompleteStyles()
            case 'listening':
                return rotateBuildSession()
        }
    }

    /** Publishes graph-complete styles before rotating the App-visible build identity. */
    async function publishCompleteStyles(): Promise<void> {
        await styles.finalizeUpdate([], writeGlobalStyle)
        await rotateBuildSession()
    }

    /**
     * Applies one runtime receipt to the active shared patch journal.
     *
     * Publication alone never prunes history: only the runtime can prove installation, graph propagation, and accept callbacks
     * completed. A rebuild report likewise enters this serialized edge so it cannot rotate the build during an in-flight write.
     */
    function processReport(report: RuntimeReport): void {
        // Delayed reports from older builds must never prune the live build's cumulative patch history.
        if (!journal.isCurrentBuild(report.buildId)) {
            return
        }

        switch (report.kind) {
            case 'rebuild': {
                requestFullBuild(report.reason)
                return
            }
            case 'applied': {
                journal.acknowledge(report.seq)
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
                // Normalize platform filesystem notifications before compilation. In particular, a single Windows full-file
                // save can emit separate truncate and write events. Rolldown's debounce folds those physical events into one
                // logical source generation; the RxJS result stream still preserves every callback emitted after compilation.
                skipWrite: false,
                useDebounce: true
            }
        })
    }

    /** Centralizes the one diagnostic and DevEngine command used by every rebuild authority. */
    function requestFullBuild(reason: string | undefined): void {
        server.config.logger.info(`[vpt] wx full rebuild required${reason ? `: ${reason}` : ''}`)
        engine.triggerFullBuild()
    }

    /** Selects active updates and publishes their resulting host transaction. */
    async function publishUpdates(result: HmrUpdates): Promise<void> {
        /*
         * This transaction-local array preserves every patch in one pass and permits immediate rebuild dominance. It never escapes
         * the serialized action. A filter/find/flatMap pipeline would scan a large burst repeatedly and allocate an intermediate.
         */
        const patches: PatchUpdate[] = []
        for (const { clientId, update } of result.updates) {
            if (!journal.isCurrentBuild(clientId) || update.type === 'Noop') {
                continue
            }

            if (update.type === 'Patch') {
                patches.push(update)
                continue
            }

            requestFullBuild(update.reason)
            return
        }

        await publishPatchBatch(patches)
    }

    /** Publishes one coherent WXSS, selected-mode delivery, and Rolldown-frontier transaction. */
    async function publishPatchBatch(patches: readonly PatchUpdate[]): Promise<void> {
        if (patches.length === 0) {
            return
        }

        // `onHmrUpdates` runs after every affected transform has updated captured CSS and the live import graph. The style
        // boundary finalizes every factory before atomically publishing their matching WXSS.
        const finalizedPatches = await styles.finalizeUpdate(patches, writeGlobalStyle)

        // Publish global.wxss before matching JavaScript delivery so the selected mode observes a coherent HMR transaction.
        // Delivery must become durable before Rolldown advances: later patches may be generated relative to this batch even if
        // the runtime has not applied it. PatchJournal retains the unapplied range, so every later publication still bridges the
        // runtime's older application frontier.
        await journal.produce(finalizedPatches)

        await commitPublishedBatch(finalizedPatches)
    }

    /**
     * Advances Rolldown's published frontier in the same sequence order materialized by cumulative mode delivery.
     *
     * Given a batch [5, 6], journal.produce has already made factories [5, 6] durable through the selected mode. This
     * method then commits payload 5 followed by payload 6. If the runtime observes neither publication before sequence 7, the
     * next cumulative delivery contains [5, 6, 7], while Rolldown may generate 7 relative to its published sequence 6.
     */
    async function commitPublishedBatch(batch: readonly PatchUpdate[]): Promise<void> {
        // Do not use Promise.all or deduplicate filenames. Multiple sequential payloads may target the same output filename,
        // and each notification commits one distinct Rolldown payload. Awaiting in order preserves the exact frontier encoded
        // by PatchUpdate.seq and prevents a later payload from becoming visible to the engine before its predecessor.
        for (const patch of batch) {
            await engine.notifyPayloadDelivered(patch.filename)
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

/** Materializes the authenticated Vite WebSocket endpoint used by every WX HMR runtime. */
function createSocketEndpoint(server: ViteDevServer, port: number): string {
    const socketOptions = typeof server.config.server.ws === 'object' ? server.config.server.ws : undefined
    if (
        server.config.server.ws === false ||
        server.config.base !== '/' ||
        socketOptions?.path !== hmrEndpointPath ||
        socketOptions?.protocol !== undefined ||
        socketOptions?.host !== undefined ||
        socketOptions?.port !== undefined ||
        socketOptions?.clientPort !== undefined ||
        socketOptions?.server !== undefined
    ) {
        throw new Error('WX HMR requires Vite WebSocket on the development HTTP server.')
    }

    const protocol = server.config.server.https ? 'wss' : 'ws'
    const endpointUrl = new URL(`${protocol}://${resolveEndpointHost(server)}:${port}${hmrEndpointPath}`)
    endpointUrl.searchParams.set('token', server.config.webSocketToken)
    return endpointUrl.href
}

/** Replaces browser server URLs with the physical project directory consumed by WeChat DevTools. */
function installDevToolsPrinter(server: ViteDevServer): void {
    /*
     * Vite exposes printing as a mutable server callback because URLs are unknown until startup. WX uses its socket only for HMR
     * control while users open the physical output directory, so the browser printer advertises unusable navigation URLs.
     * Replacing only this presentation callback leaves resolved URLs and server routing untouched and naturally dies with the
     * server instance; logging elsewhere would duplicate Vite's one readiness notification.
     */
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
function logMiniError(logger: ViteDevServer['config']['logger'], prefix: string, error: unknown): void {
    if (Error.isError(error)) {
        logger.error(`[vpt] ${prefix}`, { error })
    } else {
        logger.error(`[vpt] ${prefix} with unknown error: ${error}`)
    }
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
