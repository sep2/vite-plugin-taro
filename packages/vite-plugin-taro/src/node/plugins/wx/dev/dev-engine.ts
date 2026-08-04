import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { InputOptions, OutputOptions } from 'rolldown'
import { type DevEngine, dev, viteReporterPlugin } from 'rolldown/experimental'
import type { ViteDevServer } from 'vite'
import { resolvePackageFile } from '../../../utils/packages.ts'

export type WxDevEngine = Readonly<{
    close: () => Promise<void>
}>

export async function createWxDevEngine({ server }: { server: ViteDevServer }): Promise<WxDevEngine> {
    const bundledDev = getBundledDev(server)

    installRolldownOptions()
    const engine: DevEngine = await createEngine()

    // The WX adapter owns the only DevEngine. Vite's default listen() would create a second
    // skip-write engine that renders into memory for browser HMR; instead the physical
    // engine's initial build must finish before the HTTP server becomes ready, because
    // DevTools opens the output directory directly and the app requires its files on disk.
    bundledDev._devEngine = engine
    bundledDev.triggerBundleRegenerationIfStale = async () => false
    bundledDev.listen = async () => {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
    }

    return {
        close: async () => {
            await engine.close()
        }
    }

    async function createEngine(): Promise<DevEngine> {
        const options = await bundledDev.getRolldownOptions()
        if (!options.output || Array.isArray(options.output)) {
            throw new Error('wx development requires exactly one Rolldown output.')
        }

        return dev(options, options.output, {
            onAdditionalAssets: () => {
                console.log('onAdditionalAssets')
            },
            onHmrUpdates: (result) => {
                if (result instanceof Error) {
                    console.error('[vite-plugin-taro] wx HMR update failed', result)
                }
            },
            onOutput: (result) => {
                if (result instanceof Error) {
                    console.error('[vite-plugin-taro] wx dev build failed', result)
                }
            },
            rebuildStrategy: 'never',
            watch: { skipWrite: false }
        })
    }

    /** Restores physical Mini Program output conventions after Vite applies browser bundled-dev defaults. */
    function installRolldownOptions(): void {
        const original = bundledDev.getRolldownOptions.bind(bundledDev)
        const runtimeSource = readFileSync(resolvePackageFile('dist/runtime/wx/dev/dev-runtime.js'), 'utf8')

        bundledDev.getRolldownOptions = async () => {
            const options = await original()
            if (Array.isArray(options.output)) {
                throw new Error('wx development requires one configured Rolldown output.')
            }
            options.output ??= {}
            const output = options.output
            const configuredOutput = server.config.build.rolldownOptions.output
            if (Array.isArray(configuredOutput)) {
                throw new Error('wx development supports one configured Rolldown output.')
            }

            const configured = (configuredOutput ?? {}) as Record<string, unknown>
            Object.assign(output, configured, {
                assetFileNames: createStableFileNames(configured.assetFileNames, 'assets/[name][extname]'),
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
