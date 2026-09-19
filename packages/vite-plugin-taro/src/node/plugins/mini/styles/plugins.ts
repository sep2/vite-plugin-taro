import path from 'node:path'
import { Scanner } from '@tailwindcss/oxide'
import { createTailwindV4Engine, resolveTailwindV4Source, type TailwindV4Engine } from '@tailwindcss-mangle/engine/v4'
import type { PluginContext } from 'rolldown'
import { type BuildOptions, isCSSRequest, normalizePath, type Plugin, type Rolldown } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { wrapPluginTransform } from '../../../utils/vite.ts'
import { tailwindcssBasedir } from '../../tailwind/tailwind-css.ts'
import type { MiniContract } from '../mini-contract.ts'
import { createMiniTransformer } from './create-mini-transformer.ts'
import { minifyMiniStylesheet } from './minify-mini-stylesheet.ts'

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

/** Vite plugin with the host operation that finalizes one coherent native-style/JavaScript transaction. */
export type MiniStylePlugin = Plugin &
    Readonly<{
        /** Neutralizes browser CSS payloads and atomically publishes the matching global native stylesheet. */
        finalizeUpdate: <Artifact extends JavaScriptArtifact>(
            artifacts: readonly Artifact[],
            writeStylesheet: (stylesheet: string) => Promise<void>
        ) => Promise<readonly Artifact[]>
    }>

/** Vite CSS request modes that do not represent graph-owned application stylesheets. */
const ignoredStyleQueries = ['direct', 'inline', 'inline-css', 'raw', 'style-attr', 'transform-only', 'url'] as const
const tailwindRootImportPattern = /(@(?:import|reference)\s+(?:url\(\s*)?)(['"])tailwindcss\2(?=\s*\)?(?:\s|;|$))/g
const tailwindcssEntryPath = normalizePath(path.join(tailwindcssBasedir, 'index.css'))

/**
 * Creates the single owner of global native-style compilation, graph projection, class rewriting, and publication.
 *
 * ## Architectural invariant
 *
 * One Mini Program transaction must expose JavaScript and native CSS produced from one class-identity snapshot. Tailwind utility
 * names can be escaped—for example, `py-5.5` becomes `py-5_d5`—so publishing either side independently can leave running code
 * referring to selectors that do not yet exist. This plugin therefore treats reachable CSS, Tailwind candidates, converted
 * native CSS, and converted JavaScript as one output. Complete builds and HMR updates both call `finalizeOutput()`; they differ only
 * in how the returned bytes are materialized.
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
 * 5. VPT owns physical global native CSS and patch publication. Vite's browser CSS asset is only an intermediate carrier and is
 *    removed before VPT emits the contract-selected global stylesheet.
 *
 * Native Page and component styles are outside this global pipeline. The target skeleton is generated after this style plugin
 * and emits those opaque companions later. Mini output also enforces `cssCodeSplit: false`, so Vite contributes at
 * most one browser compiler stylesheet for this plugin to replace.
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
 * state. Only a successful transform updates `styleByModuleId`; syntax errors therefore leave the last successful CSS available
 * to the currently running application. Query modes such as `?raw`, `?url`, and `?inline` are excluded because they represent
 * values rather than graph-owned stylesheets.
 *
 * ### 3. Live-graph projection
 *
 * Output finalization starts from resolved App/Page entry IDs and traverses Rolldown's current static and dynamic import edges
 * in dependency-first post-order. Transaction-local visited sets terminate cycles and deduplicate shared modules and physical
 * stylesheets. A retained stylesheet contributes only when its module is still reachable, so removing an import prunes its CSS
 * and Tailwind candidates without a separate prune protocol or persistent topology cache. Candidate sets are unioned only from
 * the Tailwind roots whose captured CSS survives that exact traversal, preserving the CSS/class identity invariant.
 *
 * ### 4. Shared native-style finalization
 *
 * `finalizeOutput()` converts the concatenated reachable CSS to native CSS, optionally minifies that complete global file
 * (including HTML defaults), then transforms each JavaScript artifact with the same projected class set. Both builds and HMR
 * follow `build.cssMinify`, defaulting to `build.minify`, using Lightning CSS. Vite's intermediate CSS minification
 * remains disabled so only final native bytes are optimized. The function returns data without bundle mutation or filesystem
 * publication. Any conversion or minification failure rejects before callers expose partial output. JavaScript conversion is
 * skipped when the projection contains no Tailwind candidates, preserving ordinary bundle bytes.
 *
 * `createFinalizeOutput()` captures the resolved output policy once and retains only the latest successful CSS conversion and
 * candidate identity. Every transaction supplies a fresh live-graph projection, but byte-identical CSS skips both PostCSS and
 * Lightning CSS. Equal candidate contents reuse the same set and replacement table even when the projection allocated a new
 * set. Changed candidates never reuse stale replacements; conversion failures do not advance the snapshot.
 *
 * ### 5a. Complete-build commit
 *
 * The post-order `generateBundle` hook gathers all JavaScript chunks, finalizes them as one operation, and only then mutates the
 * bundle. It assigns converted code, clears invalid source maps, removes Vite's intermediate browser stylesheet, and always
 * emits the contract-selected global file, including the HTML compatibility base even when the application has no styles.
 * Native output hooks run afterward and emit Page/component companion files independently.
 *
 * ### 5b. Development commit
 *
 * The development host calls `finalizeUpdate()` after Rolldown produces patch factories or a complete-output notification.
 * Finalization uses the `PluginContext` captured by `buildStart`, so it observes the same current graph as the compiler. After
 * all conversion succeeds, the host's atomic writer publishes changed native CSS before `finalizeUpdate()` returns converted
 * patch factories. Their captured Vite CSS literals are emptied first; factories, exports, changed IDs, and sequences remain
 * intact. The patch publisher therefore cannot expose newer JavaScript class identities before matching selectors exist.
 * `publishedStylesheet` advances only after a successful write and suppresses byte-identical native-tool reload events.
 *
 * ## Retained state and lifecycle
 *
 * Each plugin instance owns the following bounded state and transformation services:
 *
 * - `cssMinify`: requested global-style minification captured before disabling Vite's intermediate pass, then resolved once;
 * - `entryIds`: graph-exact App/Page entry identities resolved at the start of each build;
 * - `graphContext`: the active Rolldown graph reader needed by host calls made outside plugin hooks;
 * - `styleByModuleId`: the latest successful Vite CSS plus optional Tailwind state at one normalized module identity;
 * - `publishedStylesheet`: the last durably published development stylesheet used for unchanged-write suppression;
 * - `finalizeOutput`: resolved output options, the fixed Mini transformer, and the latest successful CSS/candidate snapshot.
 *
 * The state owners remain scoped to one plugin instance; `entryIds` is atomically replaced after each complete resolution.
 * A development watcher retains them across updates; build and watcher shutdown clear the complete style store.
 *
 * ## Cost model
 *
 * Projection is `O(V + E + B + C)` for reachable modules, import edges, concatenated CSS bytes, and candidate insertions.
 * Building one exact candidate precheck costs `O(C)` candidate bytes and testing a chunk costs `O(J)` source bytes. Matching
 * chunks then parse and walk in `O(J)`; replacing `Kᵢ` candidate tokens in literal `i` costs `O(LᵢKᵢ)` while preserving
 * untouched bytes through Rolldown's native editor. Comparing candidate sets costs `O(C)` without sorting. Retained memory
 * is `O(B + C + D + F)` for latest CSS, candidate sets, compiler dependencies, and watched file identities; no second application
 * graph is retained. The Tailwind generator stays alive across candidate edits to avoid repeating source normalization and
 * compiler initialization. Native CSS conversion/minification runs only when projected CSS changes;
 * no extra source reads or graph traversals are needed.
 */
export function createMiniStylePlugin(
    contract: Pick<MiniContract, 'styles'>,
    applicationEntryIds: readonly string[]
): MiniStylePlugin {
    // Late config captures the requested switch before disabling Vite's intermediate pass; configResolved supplies the
    // resolved JS-minification default. The same policy stays fixed throughout builds and HMR.
    let cssMinify: BuildOptions['cssMinify']
    // This mutable root list is replaced in buildStart with Vite/Rolldown's exact cross-platform graph identities.
    let entryIds = applicationEntryIds
    // configResolved initializes this service once the output policy is known; all builds and HMR reuse its bounded cache.
    let finalizeOutput: ReturnType<typeof createFinalizeOutput>

    // buildStart installs this mutable context because the development host finalizes output outside a Rolldown plugin hook.
    let graphContext: PluginContext
    // This mutable map is the only retained style store: Vite and Tailwind update separate fields at one module identity.
    const styleByModuleId = new Map<string, StyleModule>()
    // This mutable frontier advances only after the host durably writes native CSS, suppressing byte-identical filesystem events.
    let publishedStylesheet: string | undefined

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
            // Observe user and ordinary plugin configuration before reserving minification for the native global output.
            order: 'post',
            handler(config) {
                cssMinify = config.build?.cssMinify
                return { build: { cssMinify: false } }
            }
        },
        /** Resolves the output policy and installs the private Vite integration that observes fully processed module CSS. */
        configResolved(config) {
            cssMinify ??= Boolean(config.build.minify)
            finalizeOutput = createFinalizeOutput({ filename: contract.styles.globalFileName, minify: cssMinify })

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
            // Resolve through Rolldown instead of reconstructing real paths, whose drive casing and separators vary on Windows.
            const resolvedEntryIds = await Promise.all(
                applicationEntryIds.map(async (entryId) => (await this.resolve(entryId))!.id)
            )

            // Commit the complete root set together so finalization never observes a partially resolved application graph.
            entryIds = resolvedEntryIds
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
                const finalized = await finalizeOutput(
                    projectStyles(entryIds, styleByModuleId, this),
                    chunks.map((chunk) => ({ code: chunk.code, filename: chunk.fileName }))
                )

                // Step 3: commit the converted JavaScript as one completed result and discard now-invalid source maps.
                chunks.forEach((chunk, index) => {
                    chunk.code = finalized.javaScript[index]!
                    chunk.map = null
                })

                // Step 4: remove Vite's browser CSS carrier; VPT owns the sole physical global native stylesheet.
                Object.entries(bundle).forEach(([fileName, output]) => {
                    if (isStyleAsset(output)) {
                        delete bundle[fileName]
                    }
                })

                // Step 5: always emit the imported global file, including the HTML base for applications without styles.
                this.emitFile({ type: 'asset', fileName: contract.styles.globalFileName, source: finalized.stylesheet })
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
        },
        /** Finalizes one development result and publishes matching native CSS before exposing converted patch factories. */
        finalizeUpdate: async <Artifact extends JavaScriptArtifact>(
            artifacts: readonly Artifact[],
            writeStylesheet: (stylesheet: string) => Promise<void>
        ): Promise<readonly Artifact[]> => {
            // CSS is already captured for physical publication, so its browser payload need not enter JavaScript conversion.
            const javaScript = artifacts.map((artifact) => ({
                code: neutralizeViteCssPayload(artifact.code),
                filename: artifact.filename
            }))

            // Step 1: complete every fallible conversion against one snapshot of the current module graph.
            const output = await finalizeOutput(projectStyles(entryIds, styleByModuleId, graphContext), javaScript)

            // Step 2: publish native CSS first so the tool cannot observe JavaScript with newer class identities.
            if (output.stylesheet !== publishedStylesheet) {
                await writeStylesheet(output.stylesheet)
                // Advance the frontier only after the atomic writer succeeds; failed writes remain retryable.
                publishedStylesheet = output.stylesheet
            }

            // Step 3: preserve patch metadata and replace only code after the matching stylesheet is durable.
            return artifacts.map((artifact, index) => ({ ...artifact, code: output.javaScript[index]! }))
        }
    }
}

/** Creates one cached native-output converter for a fixed filename and minification policy. */
function createFinalizeOutput(stylesheetOptions: Parameters<typeof minifyMiniStylesheet>[1]) {
    // The fixed transformer retains only deterministic class-escape and PostCSS pipeline caches for this finalizer.
    const miniTransformer = createMiniTransformer()
    // Retain only the latest successful CSS conversion and candidate identity, not historical outputs or graph topology.
    let previousOutput:
        | Readonly<{
              css: string
              classSet: ReadonlySet<string>
              stylesheet: string
          }>
        | undefined

    return async function finalizeOutput(
        projection: ReturnType<typeof projectStyles>,
        javaScript: readonly JavaScriptArtifact[]
    ) {
        // Step 1: reuse candidate identities only when this transaction's live projection has equal contents.
        const classSet =
            previousOutput && equalCandidates(previousOutput.classSet, projection.classSet)
                ? previousOutput.classSet
                : projection.classSet

        // Step 2: reuse identical CSS or convert before minifying, including native units, selectors, and HTML defaults.
        const stylesheet =
            previousOutput?.css === projection.css
                ? previousOutput.stylesheet
                : await minifyMiniStylesheet(
                      await miniTransformer.transformStylesheet(projection.css),
                      stylesheetOptions
                  )

        // Step 3: transform artifacts independently with the exact candidate set projected from that stylesheet.
        const transformedJavaScript = javaScript.map((artifact) =>
            miniTransformer.transformJavaScript({
                classSet,
                code: artifact.code,
                filename: artifact.filename
            })
        )

        // Advance only after all conversions succeed; failed CSS/JS transactions leave the reusable snapshot intact.
        previousOutput = { css: projection.css, classSet, stylesheet }
        // Returning data keeps physical bundle mutation and development filesystem publication at their respective owners.
        return { javaScript: transformedJavaScript, stylesheet }
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

/** Selects styles reachable from the configured entries in deterministic dependency-first cascade order. */
function projectStyles(
    entryIds: readonly string[],
    styleByModuleId: ReadonlyMap<string, StyleModule>,
    context: PluginContext
) {
    // This mutable transaction-local set terminates cycles and prevents repeated traversal through shared JavaScript modules.
    const visitedModuleIds = new Set<string>()
    // This mutable transaction-local set emits a physical stylesheet once even when multiple graph paths import it.
    const visitedStyleIds = new Set<string>()
    // This mutable transaction-local list records dependency-first CSS order for the final concatenated stylesheet.
    const css: string[] = []
    // This mutable transaction-local set unions candidates from exactly the Tailwind roots contributing reachable CSS.
    const classSet = new Set<string>()

    /** Performs a post-order graph visit so dependencies precede the modules that import them in the CSS cascade. */
    const visit = (moduleId: string): void => {
        // Step 1: claim the module before recursion to terminate cycles and shared dependency paths.
        if (visitedModuleIds.has(moduleId)) {
            return
        }
        visitedModuleIds.add(moduleId)

        // Step 2: ignore IDs absent from the current graph; retained CSS alone never makes a removed module reachable.
        const moduleInfo = context.getModuleInfo(moduleId)
        if (!moduleInfo) {
            return
        }

        // Step 3: visit static and dynamic dependencies before considering this module's own stylesheet contribution.
        moduleInfo.importedIds.forEach(visit)
        moduleInfo.dynamicallyImportedIds.forEach(visit)

        // Step 4: join graph identity to captured style identity and append each reachable physical stylesheet once.
        const styleId = normalizeModuleId(moduleId)
        const style = styleByModuleId.get(styleId)
        if (style?.css === undefined || visitedStyleIds.has(styleId)) {
            return
        }
        visitedStyleIds.add(styleId)
        css.push(style.css)

        // Step 5: union candidates only from roots whose CSS survived this same reachability projection.
        style.tailwind?.classSet.forEach((className) => {
            classSet.add(className)
        })
    }

    // Each App/Page entry is a root; shared visited sets deduplicate styles across the complete application projection.
    entryIds.forEach(visit)

    return { classSet: classSet, css: css.join('\n') }
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
