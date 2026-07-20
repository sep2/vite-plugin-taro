import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Subscription } from 'rxjs'
import type { ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../../options.ts'
import { SerializedTaskQueue } from '../../../../utils/serialized-task-queue.ts'
import { createControlChannel } from './control-channel.ts'
import { createDevEngineEdge, type DevEngineHmrResult } from './dev-engine.ts'
import { createPhysicalOutputEdge } from './physical-output.ts'
import { preparePublicFiles, watchPublicFiles } from './public-files.ts'
import {
    createTopologyState,
    type TopologyCommand,
    type TopologyFact,
    type TopologyState,
    transitionTopology
} from './topology.ts'

const safeJavaScriptExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])

/** Wires the pure current-build topology to the DevEngine, control endpoint, and physical WX output. */
export async function createDevHost(
    server: ViteDevServer,
    options: VitePluginTaroOptions
): Promise<{ close(): Promise<void> }> {
    const outDir = path.resolve(server.config.root, server.config.build.outDir)
    const pageFiles = new Set(options.pages.map((page) => `${page.path}.js`))
    const subscriptions: Subscription[] = []
    let closed = false
    let topologyState = createTopologyState()

    await preparePublicFiles({
        emptyOutDir: server.config.build.emptyOutDir !== false,
        outDir,
        publicDir: server.config.publicDir || ''
    })

    const devEngine = createDevEngineEdge({ pageFiles, server })
    const control = createControlChannel({
        registerModules: devEngine.registerModules,
        reportFailure: (failure) => dispatch({ type: 'runtime-failed', failure }),
        requestPatches: (request) => dispatch({ type: 'runtime-requested', request }),
        server
    })
    const physicalOutput = createPhysicalOutputEdge({ outDir, server, token: control.token })
    const commands = new SerializedTaskQueue(reportError)

    subscriptions.push(
        devEngine.hmrResults$.subscribe((result) => handleHmrResult(result)),
        devEngine.additionalAssets$.subscribe(() =>
            dispatch({ type: 'full-build-requested', reason: 'native-output-changed' })
        )
    )

    const publicFiles = watchPublicFiles({
        onChanged: () => dispatch({ type: 'full-build-requested', reason: 'native-output-changed' }),
        onError: (error) => reportError('public file synchronization', error),
        outDir,
        publicDir: server.config.publicDir,
        watcher: server.watcher
    })

    dispatch({ type: 'full-build-requested', reason: 'initial' })

    return {
        async close(): Promise<void> {
            closed = true
            control.close()
            await publicFiles.close()
            physicalOutput.close()
            for (const subscription of subscriptions) {
                subscription.unsubscribe()
            }
            await commands.waitForIdle()
        }
    }

    /** Feeds one edge fact through the pure reducer, then serializes the resulting physical commands. */
    function dispatch(fact: TopologyFact): void {
        if (closed) {
            return
        }
        const transition = transitionTopology(topologyState, fact)
        topologyState = transition.state
        for (const command of transition.commands) {
            commands.enqueue(command.kind, () => executeCommand(command))
        }
    }

    async function executeCommand(command: TopologyCommand): Promise<void> {
        if (closed) {
            return
        }
        switch (command.kind) {
            case 'create-full-build':
                dispatch({
                    type: 'full-build-started',
                    request: { buildId: randomUUID(), reason: command.reason }
                })
                return
            case 'run-full-build': {
                const result = await devEngine.runBuild(command.request)
                if (!result.ok) {
                    reportError('complete build', result.error)
                }
                dispatch({ type: 'full-build-finished', result })
                return
            }
            case 'write-bootstrap': {
                try {
                    await physicalOutput.writeBootstrap({ buildId: command.buildId })
                    dispatch({ type: 'bootstrap-written', result: { buildId: command.buildId, ok: true } })
                } catch (error) {
                    reportError('HMR bootstrap write', error)
                    dispatch({ type: 'bootstrap-written', result: { buildId: command.buildId, error, ok: false } })
                }
                return
            }
            case 'write-patches': {
                const { projection } = command
                try {
                    await physicalOutput.writePatches(projection)
                    dispatch({
                        type: 'patches-written',
                        result: {
                            buildId: projection.buildId,
                            fromVersion: projection.fromVersion,
                            ok: true,
                            targetVersion: projection.targetVersion
                        }
                    })
                } catch (error) {
                    reportError('HMR patches write', error)
                    dispatch({
                        type: 'patches-written',
                        result: {
                            buildId: projection.buildId,
                            error,
                            fromVersion: projection.fromVersion,
                            ok: false,
                            targetVersion: projection.targetVersion
                        }
                    })
                }
            }
        }
    }

    function handleHmrResult(result: DevEngineHmrResult): void {
        const buildId = activeBuildId(topologyState)
        if (!buildId) {
            return
        }
        if (result instanceof Error) {
            reportError('HMR generation', result)
            dispatch({ type: 'full-build-requested', reason: 'rolldown-full-reload' })
            return
        }
        if (
            !result.changedFiles.every(isSafeJavaScriptChange) ||
            result.updates.some(({ update }) => update.type === 'FullReload')
        ) {
            dispatch({ type: 'full-build-requested', reason: 'rolldown-full-reload' })
            return
        }
        for (const { clientId, update } of result.updates) {
            if (update.type === 'Patch') {
                dispatch({
                    type: 'patch-produced',
                    patch: {
                        buildId,
                        clientId,
                        patch: {
                            code: update.code,
                            fileName: update.filename,
                            sourcemap: update.sourcemap,
                            sourcemapFileName: update.sourcemapFilename
                        }
                    }
                })
            }
        }
    }
}

function activeBuildId(state: TopologyState): string | undefined {
    return state.phase.kind === 'ready' ? state.phase.buildId : undefined
}

function isSafeJavaScriptChange(fileName: string): boolean {
    return safeJavaScriptExtensions.has(path.extname(fileName.split('?', 1)[0]).toLowerCase())
}

function reportError(operation: string, error: unknown): void {
    const normalizedError = error instanceof Error ? error : new Error(String(error))
    console.error(`[vite-plugin-taro] wx ${operation} failed`, normalizedError)
}
