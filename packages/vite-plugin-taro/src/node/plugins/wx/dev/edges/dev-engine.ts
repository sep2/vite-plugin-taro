import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { InputOptions, OutputOptions, RolldownOutput } from 'rolldown'
import { type DevEngine, dev, viteReporterPlugin } from 'rolldown/experimental'
import { type Subject as FactSubject, firstValueFrom, ReplaySubject, Subject, take } from 'rxjs'
import type { ViteDevServer } from 'vite'
import { resolvePackageFile } from '../../../../utils/packages.ts'
import type { BuildRequest, FullBuildResult, WxHostFact } from '../topology.ts'
import { hmrInfoFileName, hmrPatchesFileName } from './files.ts'

const safeJavaScriptExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])

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

type OutputAddon = string | ((chunk: { fileName: string }) => string | Promise<string>)

/**
 * Vite-private DevEngine edge.
 *
 * It turns native engine callbacks into host facts directly. The topology already owns the current Build, so this edge
 * emits HostPatches without retaining build or runtime state and never selects physical patch ranges.
 */
export type DevEngineEdge = Readonly<{
    registerModules(clientId: string, modules: string[]): Promise<boolean>
    runBuild(request: BuildRequest): Promise<FullBuildResult>
}>

export function createDevEngineEdge({
    facts$,
    pageFiles,
    server
}: {
    facts$: FactSubject<WxHostFact>
    pageFiles: ReadonlySet<string>
    server: ViteDevServer
}): DevEngineEdge {
    const bundledDev = getBundledDev(server)
    const outputResults$ = new Subject<Error | RolldownOutput>()
    const initialBuildResults$ = new ReplaySubject<FullBuildResult>(1)
    let engine: DevEngine | undefined

    installRolldownOptions()
    bundledDev.triggerBundleRegenerationIfStale = async () => false
    bundledDev.listen = async () => {
        const result = await firstValueFrom(initialBuildResults$)
        if (!result.ok) {
            throw result.error
        }
    }

    return {
        async registerModules(clientId, modules): Promise<boolean> {
            if (!engine) {
                return false
            }
            await engine.registerModules(clientId, modules)
            return true
        },
        async runBuild(request): Promise<FullBuildResult> {
            try {
                const output = engine ? await triggerFullBuild() : await startEngine()
                const result: FullBuildResult =
                    output instanceof Error
                        ? { buildId: request.buildId, error: output, ok: false }
                        : { buildId: request.buildId, ok: true }
                if (request.reason === 'initial') {
                    initialBuildResults$.next(result)
                }
                return result
            } catch (error) {
                const result: FullBuildResult = { buildId: request.buildId, error, ok: false }
                if (request.reason === 'initial') {
                    initialBuildResults$.next(result)
                }
                return result
            }
        }
    }

    async function startEngine(): Promise<Error | RolldownOutput> {
        const options = await bundledDev.getRolldownOptions()
        const output = options.output
        if (!output || Array.isArray(output)) {
            throw new Error('WX development requires exactly one Rolldown output.')
        }

        engine = await dev(options, output, {
            onAdditionalAssets: () => facts$.next({ type: 'rebuild-requested', reason: 'source-requires-full-build' }),
            onHmrUpdates: (result) => publishHmrResult(result),
            onOutput: (result) => outputResults$.next(result),
            rebuildStrategy: 'never',
            watch: { skipWrite: false }
        })
        bundledDev._devEngine = engine

        const firstOutput = firstValueFrom(outputResults$.pipe(take(1)))
        void engine.run().catch((error: unknown) => {
            outputResults$.next(error instanceof Error ? error : new Error(String(error)))
        })
        return firstOutput
    }

    async function triggerFullBuild(): Promise<Error | RolldownOutput> {
        const output = firstValueFrom(outputResults$.pipe(take(1)))
        engine?.triggerFullBuild()
        return output
    }

    /** Converts DevEngine output into facts while preserving its native safety classification boundary. */
    function publishHmrResult(result: unknown): void {
        if (result instanceof Error) {
            facts$.next({ type: 'rebuild-requested', reason: 'patch-generation-failed' })
            return
        }
        if (!isHmrResult(result)) {
            facts$.next({ type: 'rebuild-requested', reason: 'patch-generation-failed' })
            return
        }
        if (
            !result.changedFiles.every(isSafeJavaScriptChange) ||
            result.updates.some(({ update }) => update.type === 'FullReload')
        ) {
            facts$.next({ type: 'rebuild-requested', reason: 'source-requires-full-build' })
            return
        }
        for (const { clientId, update } of result.updates) {
            if (update.type !== 'Patch') {
                continue
            }
            facts$.next({
                type: 'patch-produced',
                clientId,
                patch: {
                    code: update.code,
                    fileName: update.filename,
                    sourcemap: update.sourcemap,
                    sourcemapFileName: update.sourcemapFilename
                }
            })
        }
    }

    /** Replaces Vite's browser-development output conventions with stable physical WX paths. */
    function installRolldownOptions(): void {
        const original = bundledDev.getRolldownOptions.bind(bundledDev)
        const runtimeSource = readFileSync(resolvePackageFile('dist/runtime/wx/dev/dev-runtime.js'), 'utf8')

        bundledDev.getRolldownOptions = async () => {
            const options = await original()
            if (Array.isArray(options.output)) {
                throw new Error('WX development requires exactly one Rolldown output.')
            }
            options.output ??= {}
            const output = options.output
            const configuredOutput = server.config.build.rolldownOptions.output
            if (Array.isArray(configuredOutput)) {
                throw new Error('WX development supports one configured Rolldown output.')
            }

            const configured = (configuredOutput ?? {}) as Record<string, unknown>
            const configuredBanner = configured.banner as OutputAddon | undefined
            Object.assign(output, configured, {
                assetFileNames: createStableFileNames(configured.assetFileNames, 'assets/[name][extname]'),
                banner: createDevelopmentBanner(configuredBanner, pageFiles),
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

const runtimeBinding = 'const __rolldown_runtime__ = global.__rolldown_runtime__;'

/** Injects immutable App metadata and passive Page patch delivery into stable physical output chunks. */
function createDevelopmentBanner(
    configuredBanner: OutputAddon | undefined,
    pageFiles: ReadonlySet<string>
): (chunk: { fileName: string }) => Promise<string> {
    return async (chunk) => {
        const configured =
            typeof configuredBanner === 'function' ? await configuredBanner(chunk) : (configuredBanner ?? '')
        return [configured, runtimeBinding, createHmrRequire(chunk.fileName, pageFiles)].filter(Boolean).join('\n')
    }
}

function createHmrRequire(fileName: string, pageFiles: ReadonlySet<string>): string {
    if (fileName === 'app.js') {
        return `__rolldown_runtime__.setHmrInfo(require(${JSON.stringify(`./${hmrInfoFileName}`)}));`
    }
    if (pageFiles.has(fileName)) {
        const root = '../'.repeat(fileName.split('/').length - 1)
        return `require(${JSON.stringify(`${root}${hmrPatchesFileName}`)});`
    }
    return ''
}

function isHmrResult(value: unknown): value is Readonly<{
    changedFiles: string[]
    updates: Array<{
        clientId: string
        update:
            | Readonly<{ type: 'FullReload' }>
            | Readonly<{
                  type: 'Patch'
                  code: string
                  filename: string
                  sourcemap?: string
                  sourcemapFilename?: string
              }>
    }>
}> {
    return typeof value === 'object' && value !== null && 'changedFiles' in value && 'updates' in value
}

function isSafeJavaScriptChange(fileName: string): boolean {
    return safeJavaScriptExtensions.has(path.extname(fileName.split('?', 1)[0]).toLowerCase())
}

function createStableFileNames<T>(addon: unknown, fallback: string): string | ((value: T) => string) {
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
        for (const plugin of pluginOption) {
            disableViteOxcSourcemap(plugin)
        }
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

function getBundledDev(server: ViteDevServer): BundledDev {
    const bundledDev = server.environments.client.bundledDev as unknown as BundledDev | undefined
    if (!bundledDev) {
        throw new Error('Vite did not create the WX bundled-development environment.')
    }
    return bundledDev
}
