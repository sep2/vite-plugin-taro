import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import colors from 'picocolors'
import type { ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { SerializedTaskQueue } from '../../../utils/serialized-task-queue.ts'
import { createBundledDevSession } from './legacy-bundled-dev.ts'
import { createHmrInfo, type LegacyHmrInfo, hmrInfoFileName, renderHmrInfo } from './legacy-hmr-info.ts'
import { hmrUpdateFileName, renderInitialHmrUpdate } from './legacy-hmr-update.ts'
import { createPublicDirWatcher, initializePublicDirOutput } from './legacy-public-dir.ts'

type HmrModuleRegistration = Readonly<{
    buildId: string
    clientId: string
    modules: string[]
}>

/**
 * Coordinates the one Vite environment, physical wx output directory, and HMR session.
 *
 * bundled-dev.ts owns Vite's private adapter and the DevEngine. This closure owns the physical project lifecycle around it:
 * public files, HMR metadata/update files, the HTTP registration endpoint, and shutdown ordering for WeChat DevTools.
 */
export async function createDevHost(
    server: ViteDevServer,
    options: VitePluginTaroOptions
): Promise<{ close(): Promise<void> }> {
    const outDir = path.resolve(server.config.root, server.config.build.outDir)

    // Page entry identities are exact native paths. They need the inert update dependency; application capsules and
    // shared chunks must not receive it because only native Page evaluation is observable by WeChat DevTools.
    const pageFiles = new Set(options.pages.map((page) => `${page.path}.js`))

    function reportError(operation: string, error: unknown): void {
        const normalizedError = error instanceof Error ? error : new Error(String(error))
        server.config.logger.error(`[vite-plugin-taro] wx ${operation} failed`, { error: normalizedError })
    }

    // Initial output preparation is fatal. Complete it before creating any background task source or DevEngine adapter.
    await initializePublicDirOutput({
        outDir,
        publicDir: server.config.publicDir || '',
        emptyOutDir: server.config.build.emptyOutDir !== false
    })

    // Rolldown-generated bundle output bypasses this queue and writes directly to disk. This queue serializes only
    // recoverable DevHost background work: public-file synchronization and one-time HMR-file publication.
    const taskQueue = new SerializedTaskQueue(reportError)

    // The adapter replaces bundledDev.getRolldownOptions() and bundledDev.listen().
    // Install both before Vite starts the client environment after configureServer hooks complete.
    const bundledDev = createBundledDevSession({
        server,
        pageFiles,
        reportError
    })

    const uninstallHttpHandler = setupHttpHandler({
        server,
        outDir,
        taskQueue,
        registerModules: bundledDev.registerModules,
        reportError
    })

    const closePublicDirWatcher = createPublicDirWatcher({
        watcher: server.watcher,
        outDir,
        publicDir: server.config.publicDir,
        taskQueue
    })

    return {
        async close(): Promise<void> {
            uninstallHttpHandler()
            closePublicDirWatcher()
            await taskQueue.waitForIdle()
            // Do not close the DevEngine here. Vite closes the engine published by bundled-dev.ts, whose closeBundle hook
            // invokes this callback; closing it here would recurse through the same lifecycle.
        }
    }
}

/**
 * Owns the complete HMR lifecycle for one DevHost session and returns the matching listener cleanup.
 *
 * Its explicit arguments are the only capabilities it needs from DevHost: Vite's server, physical output serialization,
 * the bundled DevEngine registration operation, and shared error reporting.
 */
function setupHttpHandler({
    server,
    outDir,
    taskQueue,
    registerModules,
    reportError
}: {
    server: ViteDevServer
    outDir: string
    taskQueue: SerializedTaskQueue
    registerModules(clientId: string, modules: string[]): Promise<boolean>
    reportError(operation: string, error: unknown): void
}): () => void {
    /** Prints the project location only after hmr/info.js exists with Vite's final listening URL. */
    function printDevToolsPath(): void {
        const relativeOutDir = path.relative(server.config.root, outDir).split(path.sep).join('/')
        const devToolsPath = relativeOutDir ? `./${relativeOutDir}` : '.'
        server.config.logger.info(
            `  ${colors.green('➜')}  ${colors.bold(colors.cyan('WeChat DevTools:'))} ${colors.cyan(devToolsPath)}`
        )
    }

    /** Registers modules reported by a runtime whose build ID matches immutable metadata for this physical session. */
    async function registerHmrModules(
        hmrInfo: LegacyHmrInfo,
        request: IncomingMessage,
        response: ServerResponse
    ): Promise<void> {
        if (request.method !== 'POST') {
            response.statusCode = 405
            response.end()
            return
        }

        try {
            const registration = await parseHmrModuleRegistration(request)
            if (registration.buildId !== hmrInfo.buildId) {
                response.statusCode = 409
                response.end()
                return
            }

            if (!(await registerModules(registration.clientId, registration.modules))) {
                response.statusCode = 409
                response.end()
                return
            }

            response.statusCode = 204
            response.end()
        } catch (error) {
            response.statusCode = 400
            response.end()
            reportError('HMR module registration', error)
        }
    }

    // The communication channel between DevHost and DevRuntime
    const hmrRequestPath = '/__vpt_hmr__'

    const publish = (): void => {
        taskQueue.enqueue('HMR file initialization', async () => {
            const origin = server.resolvedUrls?.local[0]
            if (!origin) {
                throw new Error('Vite did not resolve a development URL.')
            }

            const hmrInfo = createHmrInfo(new URL(hmrRequestPath, origin).href)
            await Promise.all([
                writeHmrFile(outDir, hmrInfoFileName, renderHmrInfo(hmrInfo)),
                writeHmrFile(outDir, hmrUpdateFileName, renderInitialHmrUpdate())
            ])

            // The endpoint is installed only after both files exist.
            server.middlewares.use(hmrRequestPath, async (request, response) => {
                await registerHmrModules(hmrInfo, request, response)
            })

            printDevToolsPath()
        })
    }

    const httpServer = server.httpServer
    if (!httpServer) {
        throw new Error('Vite did not start an http server.')
    }

    // Vite runs configureServer before binding HTTP. Publish App/Page-required HMR files and install their endpoint only
    // after listening exposes the final address; DevTools is told the path afterward.
    httpServer.once('listening', publish)

    return () => {
        httpServer.off('listening', publish)
    }
}

/** Reads the small local-only executed-module payload without adding a second transport abstraction. */
async function parseHmrModuleRegistration(request: IncomingMessage): Promise<HmrModuleRegistration> {
    let text = ''
    for await (const chunk of request) {
        text += chunk
    }

    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== 'object') {
        throw new Error('Expected an HMR module registration object.')
    }

    const { buildId, clientId, modules } = value as Partial<HmrModuleRegistration>
    if (
        typeof buildId !== 'string' ||
        typeof clientId !== 'string' ||
        !Array.isArray(modules) ||
        modules.some((module) => typeof module !== 'string')
    ) {
        throw new Error('Expected string buildId, clientId, and module IDs in HMR module registration.')
    }

    return { buildId, clientId, modules }
}

/** Atomically writes one DevHost-owned HMR file without involving Rolldown's normal output lifecycle. */
async function writeHmrFile(outDir: string, fileName: string, source: string): Promise<void> {
    const filePath = path.join(outDir, fileName)
    const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    try {
        await fs.writeFile(temporaryPath, source)
        await fs.rename(temporaryPath, filePath)
    } finally {
        await fs.rm(temporaryPath, { force: true })
    }
}
