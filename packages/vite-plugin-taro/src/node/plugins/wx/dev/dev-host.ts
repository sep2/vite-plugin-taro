import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { EMPTY, from, Subject, type Subscription } from 'rxjs'
import { catchError, concatMap } from 'rxjs/operators'
import type { ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { createControlEdge } from './abandon/control.ts'
import { createDevEngineEdge } from './abandon/dev-engine.ts'
import { createPhysicalOutputEdge } from './abandon/output.ts'
import { preparePublicFiles, watchPublicFiles } from './abandon/public-files.ts'
import {
    type BuildRequest,
    createWxHostTopology,
    type FullBuildResult,
    type WxHostCommand,
    type WxHostFact
} from './topology.ts'

const maximumPatchPerBuild = 100

/**
 * Wires independent Vite/WX edges to one fact bus and serializes topology-selected commands.
 *
 * ```text
 * control edge ───────┐
 * DevEngine edge ─────┼──▶ facts$ ──▶ topology ──▶ commands$ ──▶ physical/build edges
 * public-files edge ──┘      ▲                                      │
 *                            └──────────── operation results ──────┘
 * ```
 *
 * DevHost owns no callbacks translating one edge into another and no protocol decisions. Every edge receives `facts$`
 * and publishes its own observations; this file only composes them and executes the two command kinds in order.
 */
export async function createDevHost(
    server: ViteDevServer,
    options: VitePluginTaroOptions
): Promise<Readonly<{ close(): Promise<void> }>> {
    const outDir = path.resolve(server.config.root, server.config.build.outDir)
    const pageFiles = new Set(options.pages.map((page) => `${page.path}.js`))
    const facts$ = new Subject<WxHostFact>()
    const subscriptions: Subscription[] = []

    await preparePublicFiles({
        emptyOutDir: server.config.build.emptyOutDir !== false,
        outDir,
        publicDir: server.config.publicDir || ''
    })

    const devEngine = createDevEngineEdge({ facts$, pageFiles, server })
    const control = createControlEdge({ facts$, registerModules: devEngine.registerModules, server })
    const physicalOutput = createPhysicalOutputEdge({ facts$, outDir, server, token: control.token })
    const commands$ = createWxHostTopology(facts$, { maximumPatchPerBuild })
    const publicFiles = watchPublicFiles({
        facts$,
        outDir,
        publicDir: server.config.publicDir,
        watcher: server.watcher
    })

    subscriptions.push(
        commands$
            .pipe(
                // One physical lane orders full builds and patches.js close-writes while facts continue to accumulate.
                concatMap((command) => from(executeCommand(command)).pipe(catchError(reportCommandFailure)))
            )
            .subscribe()
    )

    facts$.next({ type: 'rebuild-requested', reason: 'initial' })

    return {
        async close(): Promise<void> {
            control.close()
            await publicFiles.close()
            physicalOutput.close()
            for (const subscription of subscriptions) {
                subscription.unsubscribe()
            }
        }
    }

    async function executeCommand(command: WxHostCommand): Promise<void> {
        switch (command.kind) {
            case 'request-rebuild': {
                const request: BuildRequest = { buildId: randomUUID(), reason: command.reason }
                let result: FullBuildResult = await devEngine.runBuild(request)
                if (result.ok) {
                    try {
                        await physicalOutput.writeBootstrap({ buildId: result.buildId })
                    } catch (error) {
                        console.error('[vite-plugin-taro] WX full bootstrap write failed', error)
                        result = { buildId: result.buildId, error, ok: false }
                    }
                }
                facts$.next({ type: 'full-build-finished', result })
                return
            }
            case 'write-patches':
                await physicalOutput.writePatches(command.build, command.fromVersion)
        }
    }

    function reportCommandFailure(error: unknown) {
        console.error('[vite-plugin-taro] WX topology command failed', error)
        return EMPTY
    }
}
