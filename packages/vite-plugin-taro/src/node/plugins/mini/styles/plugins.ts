import { type BuildOptions, isCSSRequest, type Plugin, type Rolldown } from 'vite'
import { wrapPluginTransform } from '../../../utils/vite.ts'
import type { MiniContract } from '../mini-contract.ts'
import type { createResolver } from '../resolve/resolver.ts'
import { createMiniStyleService, type MiniStyleService } from './create-mini-style-service.ts'

/** Vite lifecycle adapter that publishes valid native CSS before patches, retaining last-good styles on CSS errors. */
export type MiniStylePlugin = Plugin & Pick<MiniStyleService, 'finalizeUpdate'>

/** Vite CSS request modes that do not represent graph-owned application stylesheets. */
const ignoredStyleQueries = ['direct', 'inline', 'inline-css', 'raw', 'style-attr', 'transform-only', 'url'] as const

/**
 * Registers Vite hooks and delegates compilation and publication to one configured style service.
 *
 * Configuration captures native output policy before reserving Vite's CSS output as an intermediate carrier.
 * configResolved constructs the service and wraps Vite's successful CSS boundary, preserving hook metadata and context.
 * Build and watch hooks supply graph contexts and invalidation events; generateBundle commits complete conversion results.
 * The development host uses finalizeUpdate to publish native styles before delivering patch factories.
 *
 * See createMiniStyleService for pipeline invariants, ownership, compilation phases, retained state, and the cost model.
 */
export function createMiniStylePlugin(
    contract: Pick<MiniContract, 'styles'>,
    entries: ReturnType<typeof createResolver>['entries']
): MiniStylePlugin {
    // Late config captures the requested switch before disabling Vite's intermediate pass; configResolved supplies the
    // resolved JS-minification default. The same policy stays fixed throughout builds and HMR.
    let cssMinify: BuildOptions['cssMinify']
    // Late config captures native splitting once before reserving Vite's CSS output for an unsplit intermediate carrier.
    let cssCodeSplit: boolean
    // configResolved constructs the service with complete policy; subsequent hooks and host updates use this instance.
    let service: MiniStyleService

    return {
        name: 'vpt:mini-styles',
        config: {
            // Observe user and ordinary plugin configuration before reserving CSS output policy for native styles.
            order: 'post',
            handler(config) {
                cssMinify = config.build?.cssMinify
                // Mini Programs default to split styles independently of Vite's intermediate browser carrier.
                cssCodeSplit = config.build?.cssCodeSplit ?? true
                return { build: { cssMinify: false, cssCodeSplit: false } }
            }
        },
        /** Resolves the output policy and installs the private Vite integration that observes fully processed module CSS. */
        configResolved(config) {
            service = createMiniStyleService(contract, entries, {
                root: config.root,
                cssMinify: cssMinify ?? Boolean(config.build.minify),
                cssCodeSplit,
                logger: config.logger
            })
            // `vite:css-post` is the boundary after all public CSS processing and before browser-module serialization.
            const cssPostPlugin = config.plugins.find((plugin) => plugin.name === 'vite:css-post')!
            wrapPluginTransform(cssPostPlugin, (transform) => {
                return async function (css, id, options) {
                    // Run Vite first so a failed CSS transform never replaces the last successful retained artifact.
                    const result = await transform.call(this, css, id, options)
                    // Only physical application styles enter native graph projection; virtual request modes keep Vite semantics.
                    if (isApplicationStyle(id)) {
                        service.captureCss(css, id)
                    }
                    return result
                }
            })
        },
        /** Supplies exact graph roots and the graph reader used by host calls outside plugin hooks. */
        async buildStart() {
            await service.startBuild(this)
        },
        transform: {
            // Ordinary CSS must still clear retained state when Tailwind imports are removed.
            filter: { id: /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/ },
            // Tailwind must expand before Vite's normal CSS pipeline produces the final module CSS captured above.
            order: 'pre',
            /** Compiles only Tailwind roots and registers every input needed for Rolldown-driven invalidation. */
            async handler(code, id) {
                // Query variants such as `?raw` are values, not application stylesheets, and must remain untouched.
                if (!isApplicationStyle(id)) {
                    return
                }
                const result = await service.compileStyle(code, id)
                if (result) {
                    result.watchFiles.forEach((file) => {
                        this.addWatchFile(file)
                    })
                    // Vite receives browser CSS and remains the sole owner of PostCSS, preprocessors, and CSS Modules.
                    return { code: result.code, map: null }
                }
            }
        },
        /** Invalidates compiler state before Rolldown transforms roots selected through their watched dependencies. */
        hotUpdate(update) {
            service.invalidate(update.file)
        },
        /** Marks roots whose compiler inputs changed for non-HMR Rolldown watch lifecycles. */
        watchChange(id) {
            service.invalidate(id)
        },
        generateBundle: {
            // Vite must finish chunking and CSS extraction before VPT finalizes the complete native output transaction.
            order: 'post',
            /** Converts every JavaScript chunk and the reachable CSS projection with one authoritative class set. */
            async handler(_, bundle) {
                // Step 1: preserve bundle order so finalized code can be assigned back by index without a second lookup map.
                const chunks = Object.values(bundle).filter(
                    (output): output is Rolldown.OutputChunk => output.type === 'chunk'
                )
                // Step 2: finish all fallible CSS and JavaScript conversion before mutating any bundle output.
                const finalized = await service.finalizeBuild(
                    chunks.map((chunk) => ({ code: chunk.code, filename: chunk.fileName })),
                    this
                )

                // Step 3: commit the converted JavaScript as one completed result and discard now-invalid source maps.
                chunks.forEach((chunk, index) => {
                    chunk.code = finalized.javaScript[index]!
                    chunk.map = null
                })

                // Step 4: remove Vite's browser CSS carrier; VPT owns the physical App/Page stylesheets.
                Object.entries(bundle).forEach(([fileName, output]) => {
                    if (isStyleAsset(output)) {
                        delete bundle[fileName]
                    }
                })

                // Step 5: emit the App base and all Page companions, even when a Page has no local CSS.
                for (const stylesheet of finalized.stylesheets) {
                    this.emitFile({ type: 'asset', ...stylesheet })
                }
            }
        },
        /** Releases build-only style captures after the final bundle has consumed them. */
        closeBundle() {
            if (this.environment.config.command === 'build') {
                service.clearStyles()
            }
        },
        /** Releases style captures and development publication frontiers when the owning watcher terminates. */
        closeWatcher() {
            service.dispose()
        },
        /** Publishes valid native CSS before JavaScript; CSS failures log errors and retain the last valid styles. */
        finalizeUpdate: (artifacts, writeStylesheet) => service.finalizeUpdate(artifacts, writeStylesheet)
    }
}

/** Returns whether a Vite request is a physical CSS module contributing to the native application stylesheet. */
function isApplicationStyle(id: string): boolean {
    // Step 1: use Vite's predicate so every supported preprocessor extension follows the same path.
    if (!isCSSRequest(id)) {
        return false
    }

    // Step 2: a query-free CSS request is always a physical application stylesheet.
    const queryStart = id.indexOf('?')
    if (queryStart < 0) {
        return true
    }

    // Step 3: reject Vite request modes whose values must not enter the global CSS projection.
    const fragmentStart = id.indexOf('#', queryStart)
    const query = id.slice(queryStart + 1, fragmentStart < 0 ? undefined : fragmentStart)
    const parameters = new URLSearchParams(query)
    return ignoredStyleQueries.every((parameter) => !parameters.has(parameter))
}

/** Identifies Vite's browser stylesheet carrier, which VPT replaces after all final CSS has been captured. */
function isStyleAsset(output: Rolldown.OutputBundle[string]): output is Rolldown.OutputAsset {
    return output.type === 'asset' && /\.(?:acss|css|ttss|wxss)$/.test(output.fileName)
}
