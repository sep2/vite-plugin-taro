import path from 'node:path'
import { Scanner } from '@tailwindcss/oxide'
import { createTailwindV4Engine, resolveTailwindV4Source, type TailwindV4Engine } from '@tailwindcss-mangle/engine/v4'
import type { PluginContext } from 'rolldown'
import { type BuildOptions, isCSSRequest, type Logger, normalizePath, type Plugin, type Rolldown } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { wrapPluginTransform } from '../../../utils/vite.ts'
import { tailwindcssBasedir } from '../../tailwind/tailwind-css.ts'
import type { MiniContract } from '../mini-contract.ts'
import type { createResolver } from '../resolve/resolver.ts'
import { createMiniTransformer } from './create-mini-transformer.ts'
import { miniHtmlBase } from './mini-html-base.ts'
import { minifyMiniStylesheet } from './minify-mini-stylesheet.ts'
import { projectMiniStyles } from './project-mini-styles.ts'

/** Persistent Tailwind state owned by one physical CSS root across incremental Rolldown transforms. */
type TailwindRoot = Readonly<{
    /** Exact root source used to decide whether the existing compiler can accept another candidate-only update. */
    source: string
    /** Authoritative raw candidates generated with the current source files; JavaScript and native styles share this set. */
    classSet: Set<string>
    /** CSS imports and compiler inputs whose changes invalidate the generator rather than only its candidate cache. */
    dependencies: ReadonlySet<string>
    /** Stateful Tailwind compiler reused for candidate-only source updates. */
    generator: TailwindV4Engine
    /** Physical files covered by Tailwind source patterns and registered with Rolldown's watcher. */
    files: readonly string[]
    /** Marks a compiler dependency change that requires replacing the generator on the root's next transform. */
    invalidated: boolean
}>

/** Latest successful Vite CSS and optional Tailwind state joined by their normalized physical module ID. */
type StyleModule = Readonly<{
    /** Vite-final CSS captured after preprocessors, PostCSS, and CSS Modules; absent until `vite:css-post` succeeds. */
    css: string | undefined
    /** Incremental Tailwind state; absent for ordinary CSS and removed when a root stops importing Tailwind. */
    tailwind: TailwindRoot | undefined
}>

/** JavaScript code plus the physical filename required by the Mini Program class-name transformer. */
type JavaScriptArtifact = Readonly<{
    code: string
    filename: string
}>

/** One graph-projected stylesheet with its native filename and App-only defaults policy. */
type StylesheetInput = Readonly<{ fileName: string; css: string; app: boolean }>

/** A successful native conversion keyed by its exact projected source. */
type ConvertedStylesheet = Readonly<{ css: string; source: string }>

/** Vite plugin that finalizes native CSS and JavaScript without discarding HMR patches on CSS errors. */
export type MiniStylePlugin = Plugin &
    Readonly<{
        /** Publishes valid native CSS before JavaScript; CSS failures only log errors and retain the last valid styles. */
        finalizeUpdate: <Artifact extends JavaScriptArtifact>(
            artifacts: readonly Artifact[],
            writeStylesheet: (fileName: string, source: string) => Promise<void>
        ) => Promise<readonly Artifact[]>
    }>

/** Vite CSS request modes that do not represent graph-owned application stylesheets. */
const ignoredStyleQueries = ['direct', 'inline', 'inline-css', 'raw', 'style-attr', 'transform-only', 'url'] as const
const tailwindRootImportPattern = /(@(?:import|reference)\s+(?:url\(\s*)?)(['"])tailwindcss\2(?=\s*\)?(?:\s|;|$))/g
const tailwindcssEntryPath = normalizePath(path.join(tailwindcssBasedir, 'index.css'))

/**
 * Creates the single owner of App/Page native-style compilation, graph projection, class rewriting, and publication.
 *
 * ## Architectural invariant
 *
 * Successful Mini Program updates expose JavaScript and native CSS produced from one class-identity snapshot. Tailwind utility
 * names can be escaped—for example, `py-5.5` becomes `py-5_d5`—so both sides share the current candidate union. Complete builds
 * reject any conversion failure. HMR instead logs native CSS errors and retains the last valid stylesheet for each failed file.
 * Failed CSS is never published. Valid JavaScript still arrives with its assigned patch sequence; dropping that sequence would
 * force the running client to rebuild and lose state. Separate build/update finalizers share conversion and caching.
 *
 * ## Ownership boundaries
 *
 * The pipeline deliberately gives each subsystem one responsibility:
 *
 * 1. Rolldown owns module reachability and invalidation. VPT reads `getModuleInfo()` and registers watch files, but does not
 *    maintain a second import graph or decide independently which root should rerun.
 * 2. The persistent Tailwind generator owns candidate discovery and incremental candidate removal. VPT invokes it only from
 *    the owning CSS root's Rolldown transform and never rescans the project during output publication.
 * 3. Vite owns preprocessors, PostCSS, CSS Modules, and final module CSS semantics. VPT observes the input to the resolved
 *    `vite:css-post` hook only after the original hook succeeds; it never rereads source files or repeats CSS preprocessing.
 * 4. The fixed Mini transformer owns selector conversion and Oxc-based JavaScript class-string conversion. One retained
 *    transformer and one projected candidate set drive both operations without loading a framework project context.
 * 5. VPT owns physical App/Page CSS and patch publication. Vite's browser CSS asset is only an intermediate carrier and is
 *    removed before VPT emits the App stylesheet and each native Page companion.
 *
 * Opaque native-component styles stay outside this pipeline and are emitted by later native output hooks. Mini output keeps
 * `cssCodeSplit: false` for Vite's intermediate browser carrier; native splitting follows App/Page graph ownership instead.
 *
 * ## Compilation phases
 *
 * ### 1. Tailwind pre-transform
 *
 * The pre-transform checks physical application CSS for Tailwind imports. Ordinary styles pass through. A
 * Tailwind root compiles to browser CSS before Vite's normal CSS pipeline runs. Successful generation records the generator,
 * watched source files, current class set, compiler dependencies, and exact root source under the normalized module ID.
 *
 * Candidate files and compiler dependencies intentionally have different invalidation behavior:
 *
 * - Candidate-file changes rerun the root with the existing Tailwind engine. The engine rescans the authoritative
 *   source set and returns one complete stylesheet containing both additions and removals.
 * - Compiler-dependency changes mark the root invalid. Its next Rolldown transform resolves a new Tailwind source, generator,
 *   and watched file set. Replacement is delayed until that transform has current source and plugin context.
 * - If a stylesheet stops being a Tailwind root, its Tailwind state is removed. The later Vite CSS hook replaces the retained
 *   CSS after normal processing succeeds.
 *
 * ### 2. Vite-final CSS capture
 *
 * `configResolved` wraps the concrete `vite:css-post` transform while preserving its hook metadata, filter, ordering, and
 * plugin context. The original Vite hook executes first, which preserves CSS Module exports and Vite's internal extraction
 * state. Only a successful transform updates `styleByModuleId`; Vite processing errors leave the last successful CSS available.
 * Native conversion may still reject CSS accepted by this hook. Query modes such as `?raw`, `?url`, and `?inline` represent
 * values rather than graph-owned stylesheets.
 *
 * ### 3. Live-graph projection
 *
 * The resolver supplies App/Page entry records; capsule resolution preserves those records and their native output paths.
 * Each capsule traverses Rolldown's current static and dynamic import edges in dependency-first post-order. Root-local visited
 * sets terminate cycles and deduplicate physical styles without suppressing another Page's independent cascade. App-reachable
 * styles belong to the App and are excluded from every Page projection; styles shared only by Pages remain in each consumer.
 * A retained stylesheet contributes only while reachable, so import removals prune CSS and candidates without a topology cache.
 * Candidate sets contain only the Tailwind roots whose captured CSS survives each entry's projection.
 *
 * App CSS is emitted at the contract's global filename; Page CSS is emitted beside each native Page shell. Only the App file
 * receives HTML display defaults. JavaScript rewriting uses the union of all surviving App/Page Tailwind candidates.
 *
 * ### 4. Shared native-style finalization
 *
 * Both output finalizers convert and optionally minify each entry's CSS, then transform every JavaScript artifact using
 * the shared candidate union. Builds and HMR follow `build.cssMinify`, defaulting to `build.minify`, using Lightning CSS.
 * Vite's intermediate CSS minification
 * remains disabled so only final native bytes are optimized. The function returns data without bundle mutation or filesystem
 * publication. Complete builds reject conversion or minification failures. HMR logs CSS errors and reuses the affected file's
 * last valid output, if any; neither invalid CSS nor partially processed CSS is published. JavaScript conversion stays strict
 * and uses current candidates, even with stale CSS. It is skipped when the projection contains no Tailwind candidates,
 * preserving ordinary bundle bytes.
 *
 * `createFinalizeOutput()` composes a strict build converter and an HMR-only recovery wrapper. Both retain the same latest
 * successful conversion per file and candidate identity. Every transaction supplies a fresh live-graph projection, but byte-identical CSS skips PostCSS and
 * Lightning CSS independently for each file. Equal candidate contents reuse the same set and replacement table even when
 * the projection allocated a new set. Changed candidates never reuse stale replacements. Invalid CSS is never cached; rejected
 * transactions do not advance the snapshot.
 *
 * ### 5a. Complete-build commit
 *
 * The post-order `generateBundle` hook gathers all JavaScript chunks, finalizes them as one operation, and only then mutates the
 * bundle. It assigns converted code, clears invalid source maps, removes Vite's intermediate browser stylesheet, and always
 * emits the App stylesheet with HTML defaults and every Page stylesheet, including empty Pages. Native output hooks run
 * afterward without Page-style placeholders; opaque native-component styles remain independently owned.
 *
 * ### 5b. Development commit
 *
 * The development host calls `finalizeUpdate()` after Rolldown produces patch factories or a complete-output notification.
 * Finalization uses the `PluginContext` captured by `buildStart`, so it observes the same current graph as the compiler. The host's
 * atomic writer publishes valid native CSS before `finalizeUpdate()` returns converted patch factories. CSS conversion errors
 * retain only the affected file's last valid styles; they do not block valid patches or healthy stylesheets. Captured Vite CSS
 * literals are emptied first; factories, exports, changed IDs, and sequences remain intact.
 * Each file's publication frontier advances only after its atomic write succeeds. A failed later write blocks JavaScript
 * delivery; retry skips files already made durable. Empty Page CSS overwrites stale styles after import removal.
 *
 * ## Retained state and lifecycle
 *
 * Each plugin instance owns the following bounded state and transformation services:
 *
 * - `cssMinify`: requested native-style minification captured before disabling Vite's intermediate pass, then resolved once;
 * - `resolvedEntries`: App/Page metadata with graph-exact capsule identities resolved at the start of each build;
 * - `graphContext`: the active Rolldown graph reader needed by host calls made outside plugin hooks;
 * - `styleByModuleId`: the latest successful Vite CSS plus optional Tailwind state at one normalized module identity;
 * - `publishedStylesheets`: the last durably published bytes per development stylesheet for unchanged-write suppression;
 * - `finalizeOutput`: resolved output options, the fixed transformer, and the latest successful per-file CSS/candidate snapshot.
 *
 * The state owners remain scoped to one plugin instance; `resolvedEntries` is atomically replaced after each complete resolution.
 * A development watcher retains them across updates; build and watcher shutdown clear the complete style store.
 *
 * ## Cost model
 *
 * Projection is `O(sum(Vᵢ + Eᵢ + Bᵢ + Cᵢ))` across App/Page roots for reachable modules, import edges, projected CSS bytes,
 * and candidate insertions. Shared subgraphs are revisited per root; candidate unioning needs no extra graph traversal.
 * Building one exact candidate precheck costs `O(C)` candidate bytes and testing a chunk costs `O(J)` source bytes. Matching
 * chunks then parse and walk in `O(J)`; replacing `Kᵢ` candidate tokens in literal `i` costs `O(LᵢKᵢ)` while preserving
 * untouched bytes through Rolldown's native editor. Comparing candidate sets costs `O(C)` without sorting. Retained memory
 * is `O(B + C + D + F)` for latest CSS, candidate sets, compiler dependencies, and watched file identities; no second application
 * graph is retained. The Tailwind generator stays alive across candidate edits to avoid repeating source normalization and
 * compiler initialization. Successful native CSS conversions are reused while projected CSS is unchanged; failures retry;
 * no extra source reads or graph traversals are needed.
 */
export function createMiniStylePlugin(
    contract: Pick<MiniContract, 'styles'>,
    entries: ReturnType<typeof createResolver>['entries']
): MiniStylePlugin {
    // Late config captures the requested switch before disabling Vite's intermediate pass; configResolved supplies the
    // resolved JS-minification default. The same policy stays fixed throughout builds and HMR.
    let cssMinify: BuildOptions['cssMinify']
    // buildStart atomically replaces these entry records with resolved capsules while preserving native output metadata.
    let resolvedEntries: typeof entries
    // configResolved initializes this service once the output policy is known; all builds and HMR reuse its bounded cache.
    let finalizeOutput: ReturnType<typeof createFinalizeOutput>

    // buildStart installs this mutable context because the development host finalizes output outside a Rolldown plugin hook.
    let graphContext: PluginContext
    // This mutable map is the only retained style store: Vite and Tailwind update separate fields at one module identity.
    const styleByModuleId = new Map<string, StyleModule>()
    // Each mutable per-file frontier advances after a durable write, allowing partial publication failures to retry safely.
    const publishedStylesheets = new Map<string, string>()

    /** Invalidates every Tailwind root fed by one changed compiler dependency. */
    const invalidateTailwindDependencies = (dependencyId: string): void => {
        styleByModuleId.forEach((style, styleId) => {
            if (style.tailwind?.dependencies.has(dependencyId)) {
                styleByModuleId.set(styleId, {
                    css: style.css,
                    // The owning root transform replaces the generator using current source and plugin context.
                    tailwind: { ...style.tailwind, invalidated: true }
                })
            }
        })
    }

    return {
        name: 'vpt:mini-styles',
        config: {
            // Observe user and ordinary plugin configuration before reserving minification for native output.
            order: 'post',
            handler(config) {
                cssMinify = config.build?.cssMinify
                return { build: { cssMinify: false } }
            }
        },
        /** Resolves the output policy and installs the private Vite integration that observes fully processed module CSS. */
        configResolved(config) {
            cssMinify ??= Boolean(config.build.minify)
            finalizeOutput = createFinalizeOutput(contract.styles, cssMinify, config.logger)

            // `vite:css-post` is the boundary after all public CSS processing and before browser-module serialization.
            const cssPostPlugin = config.plugins.find((plugin) => plugin.name === 'vite:css-post')!

            wrapPluginTransform(cssPostPlugin, (transform) => {
                return async function (css, id, options) {
                    // Run Vite first so a failed CSS transform never replaces the last successful retained artifact.
                    const result = await transform.call(this, css, id, options)

                    // Only physical application styles enter native graph projection; virtual request modes keep Vite semantics.
                    if (isApplicationStyle(id)) {
                        const styleId = normalizeModuleId(id)
                        styleByModuleId.set(styleId, {
                            css: css,
                            // Tailwind compilation runs earlier, so CSS capture must preserve the root state at this identity.
                            tailwind: styleByModuleId.get(styleId)?.tailwind
                        })
                    }
                    return result
                }
            })
        },
        /** Resolves exact graph roots and captures the graph reader used by host calls outside plugin hooks. */
        async buildStart() {
            // Resolve through Rolldown rather than reconstructing real paths, whose drive casing and separators vary on Windows.
            const resolveEntry = async (entry: typeof entries.appEntries) => ({
                ...entry,
                capsuleId: (await this.resolve(entry.capsuleId))!.id
            })
            const [appEntries, pageEntries] = await Promise.all([
                resolveEntry(entries.appEntries),
                Promise.all(entries.pageEntries.map(resolveEntry))
            ])

            // Commit App and Pages together so finalization never observes a partially resolved ownership snapshot.
            resolvedEntries = { appEntries, pageEntries }
            graphContext = this
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

                // Join this early Tailwind phase to the later Vite CSS capture through one normalized module identity.
                const rootId = normalizeModuleId(id)
                const style = styleByModuleId.get(rootId)
                const previous = style?.tailwind

                // A file can stop being a Tailwind root during HMR without discarding its last-good Vite CSS.
                if (!isTailwindRoot(code)) {
                    styleByModuleId.set(rootId, { css: style?.css, tailwind: undefined })
                    return
                }

                // Candidate-only updates reuse the Tailwind engine; compiler-input updates replace it atomically.
                const reusable = previous?.invalidated ? undefined : previous
                const compiled = await compileTailwindRoot(this.environment.config.root, rootId, code, reusable)

                // Replace the retained root record only after generation has produced a complete result.
                styleByModuleId.set(rootId, { css: style?.css, tailwind: compiled.root })

                // Compiler dependencies trigger generator replacement, while candidate files trigger incremental regeneration.
                compiled.root.dependencies.forEach((file) => {
                    this.addWatchFile(file)
                })
                compiled.root.files.forEach((file) => {
                    this.addWatchFile(file)
                })

                // Vite receives browser CSS and remains the sole owner of PostCSS, preprocessors, and CSS Modules.
                return { code: compiled.css, map: null }
            }
        },
        /** Invalidates compiler state before Rolldown transforms roots selected through their watched dependencies. */
        hotUpdate(update) {
            invalidateTailwindDependencies(normalizeModuleId(update.file))
        },
        /** Marks roots whose compiler inputs changed for non-HMR Rolldown watch lifecycles. */
        watchChange(id) {
            invalidateTailwindDependencies(normalizeModuleId(id))
        },
        generateBundle: {
            // Vite must finish chunking and CSS extraction before VPT finalizes the complete native output transaction.
            order: 'post',
            /** Converts every JavaScript chunk and the reachable CSS projection with one authoritative class set. */
            async handler(_, bundle) {
                const outputs = Object.values(bundle)

                // Step 1: preserve bundle order so finalized code can be assigned back by index without a second lookup map.
                const chunks = outputs.filter((output): output is Rolldown.OutputChunk => output.type === 'chunk')

                // Step 2: finish all fallible CSS and JavaScript conversion before mutating any bundle output.
                const finalized = await finalizeOutput.build(
                    projectMiniStyles(resolvedEntries, styleByModuleId, this),
                    chunks.map((chunk) => ({ code: chunk.code, filename: chunk.fileName }))
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
        /** Releases build-only state after the final bundle has consumed it. */
        closeBundle() {
            if (this.environment.config.command === 'build') {
                styleByModuleId.clear()
            }
        },
        /** Releases all long-lived development state when the owning watcher terminates. */
        closeWatcher() {
            styleByModuleId.clear()
            publishedStylesheets.clear()
        },
        /** Publishes valid native CSS before patch factories; native CSS errors log and retain the last valid styles. */
        finalizeUpdate: async <Artifact extends JavaScriptArtifact>(
            artifacts: readonly Artifact[],
            writeStylesheet: (fileName: string, source: string) => Promise<void>
        ): Promise<readonly Artifact[]> => {
            // CSS is already captured for physical publication, so its browser payload need not enter JavaScript conversion.
            const javaScript = artifacts.map((artifact) => ({
                code: neutralizeViteCssPayload(artifact.code),
                filename: artifact.filename
            }))

            // Step 1: convert the current graph, retaining valid styles on CSS errors rather than dropping patch sequences.
            const output = await finalizeOutput.update(
                projectMiniStyles(resolvedEntries, styleByModuleId, graphContext),
                javaScript
            )

            // Step 2: publish every changed file before JavaScript; keep successful writes durable across a later failure.
            for (const { fileName, source } of output.stylesheets) {
                if (publishedStylesheets.get(fileName) !== source) {
                    await writeStylesheet(fileName, source)
                    publishedStylesheets.set(fileName, source)
                }
            }

            // Step 3: preserve patch metadata and replace only code after every stylesheet write succeeds.
            return artifacts.map((artifact, index) => ({ ...artifact, code: output.javaScript[index]! }))
        }
    }
}

/** Caches one successful conversion per native output file and one shared JavaScript candidate identity. */
function createFinalizeOutput(styles: MiniContract['styles'], minify: BuildOptions['cssMinify'], logger: Logger) {
    const miniTransformer = createMiniTransformer()
    const extension = path.posix.extname(styles.appFileName)
    // Commit after JS conversion succeeds; tolerated HMR CSS failures retain the affected file's last valid conversion.
    let previousOutput:
        | Readonly<{
              stylesheets: ReadonlyMap<string, ConvertedStylesheet>
              classSet: ReadonlySet<string>
          }>
        | undefined

    /** Complete builds use this strict converter directly; CSS failures reject before output is published. */
    async function convertStylesheet({ fileName, css, app }: StylesheetInput): Promise<ConvertedStylesheet> {
        return {
            css,
            source: await minifyMiniStylesheet(
                `${app ? `${miniHtmlBase}\n` : ''}${await miniTransformer.transformStylesheet(css)}`,
                { filename: fileName, minify }
            )
        }
    }

    /** Only HMR catches CSS errors and falls back to the previous valid conversion. */
    async function convertUpdatedStylesheet(input: StylesheetInput, previous: ConvertedStylesheet | undefined) {
        try {
            return await convertStylesheet(input)
        } catch (error) {
            logger.error(
                `[vpt] Native CSS update failed (${input.fileName}); keeping last valid styles.\n${String(error)}`
            )
            return previous
        }
    }

    /** Share graph projection, caching, and strict JavaScript conversion without a build/HMR mode flag. */
    function createFinalizer(convert: typeof convertUpdatedStylesheet) {
        return async function finalizeOutput(
            projection: ReturnType<typeof projectMiniStyles>,
            javaScript: readonly JavaScriptArtifact[]
        ) {
            const classSet =
                previousOutput && equalCandidates(previousOutput.classSet, projection.classSet)
                    ? previousOutput.classSet
                    : projection.classSet
            const inputs = [
                { fileName: styles.globalFileName, css: projection.appEntries.css, app: true },
                ...projection.pageEntries.map((entry) => ({
                    fileName: entry.shellName.replace(/\.js$/, extension),
                    css: entry.css,
                    app: false
                }))
            ]
            // Stage the complete transaction before exposing any converted files or updating the shared snapshot.
            const nextStylesheets = new Map<string, ConvertedStylesheet>()
            const stylesheets: { fileName: string; source: string }[] = []
            for (const input of inputs) {
                const cached = previousOutput?.stylesheets.get(input.fileName)
                const converted = cached?.css === input.css ? cached : await convert(input, cached)
                if (converted) {
                    nextStylesheets.set(input.fileName, converted)
                    stylesheets.push({ fileName: input.fileName, source: converted.source })
                }
            }

            const transformedJavaScript = javaScript.map((artifact) =>
                miniTransformer.transformJavaScript({ classSet, code: artifact.code, filename: artifact.filename })
            )
            previousOutput = { stylesheets: nextStylesheets, classSet }
            return { javaScript: transformedJavaScript, stylesheets }
        }
    }

    return {
        build: createFinalizer(convertStylesheet),
        update: createFinalizer(convertUpdatedStylesheet)
    }
}

/** O(C) equality preserves candidate identity without sorting or retaining historical generations. */
function equalCandidates(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
    if (left.size !== right.size) {
        return false
    }
    for (const candidate of left) {
        if (!right.has(candidate)) {
            return false
        }
    }
    return true
}

/** Compiles one Tailwind root and returns replacement state without mutating the retained module store. */
async function compileTailwindRoot(
    projectRoot: string,
    rootId: string,
    css: string,
    previous: TailwindRoot | undefined
): Promise<Readonly<{ css: string; root: TailwindRoot }>> {
    // Step 1: exact root-source equality proves that candidate changes can reuse the existing compiler.
    const reuse = previous?.source === css

    // Step 2: compiler-input changes resolve a fresh Tailwind source and create a new engine before retained state changes.
    const generator = reuse
        ? previous.generator
        : createTailwindV4Engine(
              await resolveTailwindV4Source({
                  projectRoot: projectRoot,
                  cwd: tailwindcssBasedir,
                  cssSources: [
                      {
                          css: resolveTailwindRootImport(css),
                          base: path.dirname(rootId),
                          file: rootId
                      }
                  ]
              })
          )

    // Step 3: authoritative source scanning returns one complete stylesheet containing additions and removals.
    const generated = await generator.generate({ scanSources: true })

    // Step 4: return a complete immutable replacement record; the caller commits it only after this function succeeds.
    return {
        css: generated.css,
        root: {
            source: css,
            classSet: generated.classSet,
            dependencies: new Set(generated.dependencies.map(normalizeModuleId)),
            generator: generator,
            files: reuse ? previous.files : new Scanner({ sources: generated.sources }).files,
            invalidated: false
        }
    }
}

/** Resolves the one bare Tailwind root import through VPT's compiler-owned Tailwind installation. */
function resolveTailwindRootImport(css: string): string {
    return css.replace(tailwindRootImportPattern, (_match, prefix: string, quote: string) => {
        return `${prefix}${quote}${tailwindcssEntryPath}${quote}`
    })
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

/**
 * Empties only the CSS bytes in Vite's generated browser transport:
 *
 * ```js
 * const __vite__css = ".app { color: red }";
 * __vite__updateStyle(__vite__id, __vite__css);
 * ```
 *
 * becomes:
 *
 * ```js
 * const __vite__css = "";
 * __vite__updateStyle(__vite__id, __vite__css);
 * ```
 *
 * The surrounding factory, CSS Module exports, changed IDs, and patch sequence remain unchanged.
 */
function neutralizeViteCssPayload(code: string): string {
    return code.replace(
        /(\b(?:const|let|var)\s+__vite__css[\w$]*\s*=\s*)"(?:\\[\s\S]|[^"\\])*"(?=;\s*\b__vite__updateStyle[\w$]*\s*\()/g,
        '$1""'
    )
}

/** Detects Tailwind v4 package imports before Vite processes the resulting CSS. */
function isTailwindRoot(code: string): boolean {
    return /@(?:import|reference)\s+(?:url\(\s*)?['"]tailwindcss(?:\/[^'"]*)?['"]/.test(code)
}

/** Identifies Vite's browser stylesheet carrier, which VPT replaces after all final CSS has been captured. */
function isStyleAsset(output: Rolldown.OutputBundle[string]): output is Rolldown.OutputAsset {
    return output.type === 'asset' && /\.(?:acss|css|ttss|wxss)$/.test(output.fileName)
}
