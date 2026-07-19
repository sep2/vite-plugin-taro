import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { InputOptions, OutputOptions, RolldownOutput } from 'rolldown'
import { type BindingClientHmrUpdate, type DevEngine, dev, viteReporterPlugin } from 'rolldown/experimental'
import { firstValueFrom, ReplaySubject, Subject, take } from 'rxjs'
import type { ViteDevServer } from 'vite'
import { resolvePackageFile } from '../../../utils/packages.ts'
import { hmrInfoFileName, hmrUpdateFileName } from './hmr-files.ts'
import type { BuildRequest, CompleteBuildResult } from './topology/types.ts'

type BundledDevRolldownOptions = InputOptions & {
    output?: OutputOptions | OutputOptions[]
    experimental?: {
        devMode?: boolean | Record<string, unknown>
        [key: string]: unknown
    }
}

type BundledDev = {
    _devEngine?: DevEngine
    getRolldownOptions(): Promise<BundledDevRolldownOptions>
    listen(): Promise<void>
    triggerBundleRegenerationIfStale(): Promise<boolean>
}

type OutputAddon = string | ((chunk: { fileName: string }) => string | Promise<string>)

export type DevEngineHmrResult =
    | Error
    | Readonly<{
          changedFiles: string[]
          updates: BindingClientHmrUpdate[]
      }>

/** Vite-private and Rolldown-native edge used by the command dispatcher and control channel. */
export type DevEngineEdge = Readonly<{
    additionalAssets$: Subject<void>
    hmrResults$: Subject<DevEngineHmrResult>
    registerModules(clientId: string, modules: string[]): Promise<boolean>
    runBuild(request: BuildRequest): Promise<CompleteBuildResult>
}>

/**
 * Installs the directly-writing WX DevEngine while retaining Vite's ownership of its close lifecycle.
 *
 * The first `run-build` command creates and starts the engine. Later commands trigger native FullBuild tasks. HMR and
 * output callbacks are converted to edge facts; no DevEngine object enters the pure topology.
 */
export function createDevEngineEdge({
    pageFiles,
    server
}: {
    pageFiles: ReadonlySet<string>
    server: ViteDevServer
}): DevEngineEdge {
    const bundledDev = getBundledDev(server)
    const outputResults$ = new Subject<Error | RolldownOutput>()
    const initialBuildResults$ = new ReplaySubject<CompleteBuildResult>(1)
    const hmrResults$ = new Subject<DevEngineHmrResult>()
    const additionalAssets$ = new Subject<void>()
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
        additionalAssets$,
        hmrResults$,
        async registerModules(clientId, modules): Promise<boolean> {
            if (!engine) {
                return false
            }
            await engine.registerModules(clientId, modules)
            return true
        },
        async runBuild(request): Promise<CompleteBuildResult> {
            let result: CompleteBuildResult
            try {
                const output = engine ? await triggerFullBuild() : await startEngine()
                result =
                    output instanceof Error
                        ? { buildId: request.buildId, error: output, ok: false }
                        : { buildId: request.buildId, ok: true }
            } catch (error) {
                result = { buildId: request.buildId, error, ok: false }
            }

            if (request.reason === 'initial') {
                initialBuildResults$.next(result)
            }
            return result
        }
    }

    async function startEngine(): Promise<Error | RolldownOutput> {
        const rolldownOptions = await bundledDev.getRolldownOptions()
        const outputOptions = rolldownOptions.output
        if (!outputOptions || Array.isArray(outputOptions)) {
            throw new Error('wx development requires one Rolldown output.')
        }

        engine = await dev(rolldownOptions, outputOptions, {
            rebuildStrategy: 'never',
            onAdditionalAssets: () => {
                additionalAssets$.next()
            },
            onHmrUpdates: (result) => {
                hmrResults$.next(result)
            },
            onOutput: (result) => {
                outputResults$.next(result)
            },
            watch: { skipWrite: false }
        })
        bundledDev._devEngine = engine

        const output = firstValueFrom(outputResults$.pipe(take(1)))
        void engine.run().catch((error: unknown) => {
            outputResults$.next(error instanceof Error ? error : new Error(String(error)))
        })
        return output
    }

    async function triggerFullBuild(): Promise<Error | RolldownOutput> {
        const output = firstValueFrom(outputResults$.pipe(take(1)))
        engine?.triggerFullBuild()
        return output
    }

    /** Restores WX output semantics that Vite's bundled-development resolver replaces with browser defaults. */
    function installRolldownOptions(): void {
        const getRolldownOptions = bundledDev.getRolldownOptions.bind(bundledDev)
        const devRuntimePath = resolvePackageFile('dist/runtime/wx/dev/dev-runtime.js')
        const devRuntimeSource = readFileSync(devRuntimePath, 'utf8')

        bundledDev.getRolldownOptions = async () => {
            const rolldownOptions = await getRolldownOptions()
            if (Array.isArray(rolldownOptions.output)) {
                throw new Error('wx development supports one Rolldown output.')
            }

            rolldownOptions.output ??= {}
            const output = rolldownOptions.output
            const configuredOutput = server.config.build.rolldownOptions.output
            if (Array.isArray(configuredOutput)) {
                throw new Error('wx development supports one configured output.')
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

            rolldownOptions.experimental ??= {}
            rolldownOptions.experimental.devMode = {
                ...(typeof rolldownOptions.experimental.devMode === 'object'
                    ? rolldownOptions.experimental.devMode
                    : {}),
                implement: devRuntimeSource,
                lazy: false
            }
            rolldownOptions.plugins = [rolldownOptions.plugins, createViteReporter(server)]
            disableViteOxcSourcemap(rolldownOptions.plugins)
            return rolldownOptions
        }
    }
}

const rolldownRuntimeBinding = 'const __rolldown_runtime__ = global.__rolldown_runtime__;'

function createDevelopmentBanner(
    configuredBanner: OutputAddon | undefined,
    pageFiles: ReadonlySet<string>
): (chunk: { fileName: string }) => Promise<string> {
    return async (chunk) => {
        const configured =
            typeof configuredBanner === 'function' ? await configuredBanner(chunk) : (configuredBanner ?? '')
        const hmrRequires = createHmrRequires(chunk.fileName, pageFiles)
        return [configured, rolldownRuntimeBinding, hmrRequires].filter(Boolean).join('\n')
    }
}

function createHmrRequires(fileName: string, pageFiles: ReadonlySet<string>): string {
    if (fileName === 'app.js') {
        return `__rolldown_runtime__.setHmrInfo(require(${JSON.stringify(`./${hmrInfoFileName}`)}));`
    }
    if (pageFiles.has(fileName)) {
        const root = '../'.repeat(fileName.split('/').length - 1)
        return `require(${JSON.stringify(`${root}${hmrUpdateFileName}`)});`
    }
    return ''
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
    name?: string
    _options?: {
        transformOptions?: {
            sourcemap?: boolean
        }
    }
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
        warnLargeChunks: true
    })
}

function getBundledDev(server: ViteDevServer): BundledDev {
    const bundledDev = server.environments.client.bundledDev as unknown as BundledDev | undefined
    if (!bundledDev) {
        throw new Error('Vite did not create the wx bundled-development environment.')
    }
    return bundledDev
}
