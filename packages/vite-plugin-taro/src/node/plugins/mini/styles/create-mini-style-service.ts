import path from 'node:path'
import { Scanner } from '@tailwindcss/oxide'
import { createTailwindV4Engine, resolveTailwindV4Source, type TailwindV4Engine } from '@tailwindcss-mangle/engine/v4'
import { type BuildOptions, type Logger, normalizePath } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
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

type MiniEntries = ReturnType<typeof createResolver>['entries']

type ModuleGraph = Parameters<typeof projectMiniStyles>[2]

type BuildContext = ModuleGraph & {
    resolve(id: string): Promise<{ id: string } | null>
}

type StylePolicy = Readonly<{
    root: string
    cssCodeSplit: boolean
    cssMinify: BuildOptions['cssMinify']
    logger: Logger
}>

export type MiniStyleService = ReturnType<typeof createMiniStyleService>

const tailwindRootImportPattern = /(@(?:import|reference)\s+(?:url\(\s*)?)(['"])tailwindcss\2(?=\s*\)?(?:\s|;|$))/g
const tailwindcssEntryPath = normalizePath(path.join(tailwindcssBasedir, 'index.css'))

/**
 * Creates the service that owns App/Page native-style compilation, graph projection, class rewriting, and publication.
 *
 * The Vite adapter constructs this service with its output policy during `configResolved`. The Mini compiler creates entry
 * metadata in its async options hook and supplies it with the graph context at buildStart. The style adapter supplies successful
 * CSS captures and watch notifications, then commits complete-build results.
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
 * Opaque native-component styles stay outside this pipeline and are emitted by later native output hooks. The requested
 * `build.cssCodeSplit` controls native projection. Vite's intermediate browser carrier remains unsplit after that request
 * is captured, preventing browser CSS-loading code from leaking into native output.
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
 *   and watched file set. Replacement is delayed until that transform supplies the current source to the configured service.
 * - If a stylesheet stops being a Tailwind root, its Tailwind state is removed. The later Vite CSS hook replaces the retained
 *   CSS after normal processing succeeds.
 *
 * ### 2. Vite-final CSS capture
 *
 * The adapter's `configResolved` wraps the concrete `vite:css-post` transform while preserving its hook metadata, filter, ordering, and
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
 * With splitting disabled, one traversal visits App then configured Pages and collects all reachable CSS into the App file,
 * deduplicating shared styles and leaving Page companions empty. A retained stylesheet contributes only while reachable,
 * so import removals prune CSS and candidates without a topology cache. Candidate sets contain only surviving Tailwind roots.
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
 * The adapter's post-order `generateBundle` hook gathers all JavaScript chunks, finalizes them as one operation, and only then mutates the
 * bundle. It assigns converted code, clears invalid source maps, removes Vite's intermediate browser stylesheet, and always
 * emits the App stylesheet with HTML defaults and every Page stylesheet, including empty Pages. Native output hooks run
 * afterward without Page-style placeholders; opaque native-component styles remain independently owned.
 *
 * ### 5b. Development commit
 *
 * The development host calls `finalizeUpdate()` after Rolldown produces patch factories or a complete-output notification.
 * Finalization uses the graph reader passed to `startBuild()` by the Mini compiler's `buildStart` hook, observing the compiler's
 * current graph. The host's atomic writer publishes valid native CSS before `finalizeUpdate()` returns converted patch factories.
 * CSS conversion errors retain only the affected file's last valid styles; they do not block valid patches or healthy stylesheets.
 * Captured Vite CSS literals are emptied first; factories, exports, changed IDs, and sequences remain intact.
 * Each file's publication frontier advances only after its atomic write succeeds. A failed later write blocks JavaScript
 * delivery; retry skips files already made durable. Empty Page CSS overwrites stale styles after import removal.
 *
 * ## Retained state and lifecycle
 *
 * Each adapter captures the requested output switches before reserving Vite's intermediate CSS carrier. Its `configResolved`
 * hook resolves the minification default and constructs one service with the following policy, bounded state, and transformer:
 *
 * - `policy.root`: resolved project root used by the Tailwind compiler;
 * - `policy.cssCodeSplit`: native-style ownership policy captured before disabling Vite's browser-only splitting;
 * - `policy.cssMinify`: native-style minification captured before disabling Vite's intermediate pass, then resolved once;
 * - `resolvedEntries`: App/Page metadata with graph-exact capsule identities resolved at the start of each build;
 * - `graphContext`: the active Rolldown graph reader needed by host calls made outside plugin hooks;
 * - `styleByModuleId`: the latest successful Vite CSS plus optional Tailwind state at one normalized module identity;
 * - `publishedStylesheets`: the last durably published bytes per development stylesheet for unchanged-write suppression;
 * - `finalizeOutput`: resolved output options, the fixed transformer, and the latest successful per-file CSS/candidate snapshot.
 *
 * The state owners remain scoped to one service instance; `resolvedEntries` is atomically replaced after each complete resolution.
 * A development watcher retains them across updates; build and watcher shutdown clear the complete style store.
 *
 * ## Cost model
 *
 * Split projection is `O(sum(Vᵢ + Eᵢ + Bᵢ + Cᵢ))` across App/Page roots for reachable modules, import edges, projected CSS
 * bytes, and candidate insertions. Combined projection is `O(V + E + B + C + P)` with one traversal and P Page companions.
 * Candidate unioning needs no extra graph traversal.
 * Building one exact candidate precheck costs `O(C)` candidate bytes and testing a chunk costs `O(J)` source bytes. Matching
 * chunks then parse and walk in `O(J)`; replacing `Kᵢ` candidate tokens in literal `i` costs `O(LᵢKᵢ)` while preserving
 * untouched bytes through Rolldown's native editor. Comparing candidate sets costs `O(C)` without sorting. Retained memory
 * is `O(B + C + D + F)` for latest CSS, candidate sets, compiler dependencies, and watched file identities; no second application
 * graph is retained. The Tailwind generator stays alive across candidate edits to avoid repeating source normalization and
 * compiler initialization. Successful native CSS conversions are reused while projected CSS is unchanged; failures retry;
 * no extra source reads or graph traversals are needed.
 */
export function createMiniStyleService(contract: Pick<MiniContract, 'styles'>, policy: StylePolicy) {
    // Construction fixes the output policy and transformer; all builds and HMR reuse this bounded conversion cache.
    const finalizeOutput = createFinalizeOutput(contract.styles, policy.cssMinify, policy.logger)
    // startBuild atomically replaces these entry records with resolved capsules while preserving native output metadata.
    let resolvedEntries: MiniEntries
    // startBuild installs this mutable context because the development host finalizes output outside a Rolldown plugin hook.
    let graphContext: ModuleGraph
    // This mutable map is the only retained style store: Vite and Tailwind update separate fields at one module identity.
    const styleByModuleId = new Map<string, StyleModule>()
    // Each mutable per-file frontier advances after a durable write, allowing partial publication failures to retry safely.
    const publishedStylesheets = new Map<string, string>()

    return {
        /** Resolves exact graph roots and captures the graph reader used by host calls outside plugin hooks. */
        async startBuild(context: BuildContext, entries: MiniEntries): Promise<void> {
            // Resolve through Rolldown rather than reconstructing real paths, whose drive casing and separators vary on Windows.
            const resolveEntry = async (entry: typeof entries.appEntries) => ({
                ...entry,
                capsuleId: (await context.resolve(entry.capsuleId))!.id
            })
            const [appEntries, pageEntries] = await Promise.all([
                resolveEntry(entries.appEntries),
                Promise.all(entries.pageEntries.map(resolveEntry))
            ])
            // Commit App and Pages together so finalization never observes a partially resolved ownership snapshot.
            resolvedEntries = { appEntries, pageEntries }
            graphContext = context
        },

        /** Captures CSS after the owning preprocessor and CSS Modules pipeline succeeds. */
        captureCss(css: string, id: string): void {
            const styleId = normalizeModuleId(id)
            // Tailwind compilation runs earlier, so CSS capture must preserve the root state at this identity.
            styleByModuleId.set(styleId, { css, tailwind: styleByModuleId.get(styleId)?.tailwind })
        },

        /** Compiles a Tailwind root and returns its complete watch set to the compiler adapter. */
        async compileStyle(code: string, id: string) {
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
            const compiled = await compileTailwindRoot(policy.root, rootId, code, reusable)
            // Replace the retained root record only after generation has produced a complete result.
            styleByModuleId.set(rootId, { css: style?.css, tailwind: compiled.root })
            // Compiler dependencies trigger generator replacement, while candidate files trigger incremental regeneration.
            return {
                code: compiled.css,
                watchFiles: [...compiled.root.dependencies, ...compiled.root.files]
            }
        },

        /** Invalidates every Tailwind root fed by one changed compiler dependency; candidate edits reuse the engine. */
        invalidate(id: string): void {
            const dependencyId = normalizeModuleId(id)
            styleByModuleId.forEach((style, styleId) => {
                if (style.tailwind?.dependencies.has(dependencyId)) {
                    styleByModuleId.set(styleId, {
                        css: style.css,
                        // The owning root transform replaces the generator using current source and the resolved policy.
                        tailwind: { ...style.tailwind, invalidated: true }
                    })
                }
            })
        },

        /** Returns a complete conversion transaction for the adapter to commit to its bundle. */
        finalizeBuild(artifacts: readonly JavaScriptArtifact[], graph: ModuleGraph) {
            return finalizeOutput.build(
                projectMiniStyles(resolvedEntries, styleByModuleId, graph, policy.cssCodeSplit),
                artifacts
            )
        },

        /** Publishes valid native CSS before patch factories; native CSS errors log and retain the last valid styles. */
        async finalizeUpdate<Artifact extends JavaScriptArtifact>(
            artifacts: readonly Artifact[],
            writeStylesheet: (fileName: string, source: string) => Promise<void>
        ): Promise<readonly Artifact[]> {
            // Strip CSS after Rolldown assigns update identities so CSS edits still produce their ordered HMR factories.
            const javaScript = artifacts.map((artifact) => ({
                code: neutralizeViteCssPayload(artifact.code),
                filename: artifact.filename
            }))
            // Step 1: convert the current graph, retaining valid styles on CSS errors rather than dropping patch sequences.
            const output = await finalizeOutput.update(
                projectMiniStyles(resolvedEntries, styleByModuleId, graphContext, policy.cssCodeSplit),
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
        },

        /** Releases captured build sources after the final output has consumed them. */
        clearStyles(): void {
            styleByModuleId.clear()
        },

        /** Releases captured sources and publication frontiers when the watcher closes. */
        dispose(): void {
            styleByModuleId.clear()
            publishedStylesheets.clear()
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

/**
 * Empties only the CSS bytes in Vite's generated browser transport:
 *
 * ```js
 * const __vite__css = ".app { color: red }";
 * (0, import_client.updateStyle)(__vite__id, __vite__css);
 * ```
 *
 * becomes:
 *
 * ```js
 * const __vite__css = "";
 * (0, import_client.updateStyle)(__vite__id, __vite__css);
 * ```
 *
 * The surrounding factory, CSS Module exports, changed IDs, and patch sequence remain unchanged.
 */
function neutralizeViteCssPayload(code: string): string {
    return code.replace(
        /(\b(?:const|let|var)\s+(__vite__css[\w$]*)\s*=\s*)"(?:\\[\s\S]|[^"\\])*"(?=;\s*\(0,\s*[\w$]+\.updateStyle\)\(\s*__vite__id[\w$]*,\s*\2\s*\))/g,
        '$1""'
    )
}

/** Detects Tailwind v4 package imports before Vite processes the resulting CSS. */
function isTailwindRoot(code: string): boolean {
    return /@(?:import|reference)\s+(?:url\(\s*)?['"]tailwindcss(?:\/[^'"]*)?['"]/.test(code)
}
