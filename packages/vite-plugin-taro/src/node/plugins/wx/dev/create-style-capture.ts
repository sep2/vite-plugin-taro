import type { GetModuleInfo, Plugin } from 'rolldown'
import { isCSSRequest } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { transformWxStyle } from '../styles/transform-wx-style.ts'
import {
    composeGraphStyleCss,
    createGraphStylePlan,
    createTailwindSidecarId,
    extractViteCss,
    isGlobalStyleRequest
} from '../styles/utils.ts'
import { globalWxssFileName, writeHmrFile } from './hmr-files.ts'

/** Final CSS extracted from Vite's transformed style module, before the shared WX compatibility pass. */
type ProcessedStyle = Readonly<{
    css: string
    /** Marks roots whose generated utilities must be refreshed when JavaScript changes Tailwind candidates. */
    isTailwindRoot: boolean
}>

/** Minimal structural view of DevEngine output; style reconciliation does not own chunks or other asset metadata. */
type CompleteOutputFile =
    | Readonly<{ type: 'asset'; fileName: string; source: string | Uint8Array }>
    | Readonly<{ type: 'chunk'; fileName: string }>

export type StyleCaptureAction =
    | Readonly<{ kind: 'capture-graph'; getModuleInfo: GetModuleInfo }>
    | Readonly<{ kind: 'capture-style'; id: string; style: ProcessedStyle }>

/**
 * Captures final Vite CSS and composes the graph projection with its durable WXSS publisher.
 *
 * Rolldown remains authoritative for topology. Plugin hooks emit typed actions so the host serializes capture mutations with
 * output and HMR publication; the projection and publisher below each own only one mutable concern.
 *
 * Complete-build path:
 *   final transform captures → DevEngine output write → graph reconciliation → App build rotation
 *
 * Incremental path:
 *   final transform captures → optional Tailwind root refresh → graph rendering → WXSS write → JavaScript patch publication
 *
 * Both paths render the same ordered App/Page graph projection. This prevents complete builds and HMR from implementing two
 * subtly different CSS ownership policies, while keeping physical byte equality and atomic writes out of graph state.
 */
export function createStyleCapture({
    applicationEntryIds,
    outDir,
    emit,
    transformTailwindRoot
}: {
    applicationEntryIds: readonly string[]
    outDir: string
    emit: (action: StyleCaptureAction) => void
    transformTailwindRoot: (rootId: string, requestId: string) => Promise<Readonly<{ code: string }> | null>
}): Readonly<{
    captureGraph: (reader: GetModuleInfo) => void
    captureStyle: (id: string, style: ProcessedStyle) => void
    plugin: Plugin
    publishChanged: (changedIds: readonly string[]) => Promise<void>
    reconcileComplete: (output: readonly CompleteOutputFile[]) => Promise<void>
}> {
    const projection = createStyleProjection({
        applicationEntryIds: applicationEntryIds,
        transformTailwindRoot: transformTailwindRoot
    })
    const publication = createStylePublication(outDir)

    const plugin: Plugin = {
        name: 'vpt:wx-dev-style-capture',
        buildStart() {
            // Capture a live reader rather than a graph snapshot. Rolldown updates the capability as imports change, and a later
            // complete generation replaces it through the host action queue before that generation can publish output.
            emit({ kind: 'capture-graph', getModuleInfo: (moduleId) => this.getModuleInfo(moduleId) })
        },
        transform(code, id) {
            if (!isGlobalStyleRequest(id)) {
                return
            }

            // This host plugin runs after Vite's CSS transform, so `code` is the JavaScript wrapper containing final PostCSS and
            // CSS-Module output. Capturing source CSS instead would lose generated class names and framework transformations.
            const css = extractViteCss(code, id)
            emit({
                kind: 'capture-style',
                id: normalizeModuleId(id),
                style: {
                    css: css,
                    isTailwindRoot: css.includes('weapp-tailwindcss vite-generated-css:')
                }
            })
        }
    }

    return {
        captureGraph: projection.captureGraph,
        captureStyle: projection.captureStyle,
        plugin: plugin,
        async publishChanged(changedIds) {
            // A CSS edit already carries updated processed bytes. Any non-CSS edit can alter both imports and Tailwind class
            // candidates, so it requires a fresh graph plan and Tailwind-root generation even when no .css ID changed directly.
            const styleChanged = changedIds.some(isGlobalStyleRequest)
            const candidatesChanged = changedIds.some((id) => !isCSSRequest(id))
            if (!styleChanged && !candidatesChanged) {
                return
            }
            await publication.publish(await projection.render(candidatesChanged))
        },
        async reconcileComplete(output) {
            // Bundled development can omit CSS Modules from the compiler asset even with cssCodeSplit disabled. Observe the
            // physical output first, then reconcile the same graph projection used by incremental HMR before App rotation.
            publication.observeOutput(output)
            await publication.publish(await projection.render(false))
        }
    }
}

/**
 * Owns the live graph capability and final transformed bytes for every observed style module.
 *
 * Rendering is O(V + E + C): graph planning visits each reachable module and edge once, then composition and WX conversion
 * process C CSS bytes once. The only persistent memory is one processed byte string per style identity observed by the server.
 */
function createStyleProjection({
    applicationEntryIds,
    transformTailwindRoot
}: {
    applicationEntryIds: readonly string[]
    transformTailwindRoot: (rootId: string, requestId: string) => Promise<Readonly<{ code: string }> | null>
}): Readonly<{
    captureGraph: (reader: GetModuleInfo) => void
    captureStyle: (id: string, style: ProcessedStyle) => void
    render: (refreshTailwind: boolean) => Promise<string>
}> {
    /*
     * This mutable capability is rebound by buildStart for each complete generation. Rolldown keeps the function live across
     * incremental graph edits, so rendering uses authoritative topology without maintaining a shadow graph.
     */
    let getModuleInfo: GetModuleInfo | undefined
    /*
     * This mutable projection stores final CSS bytes that Rolldown does not retain. Successful transforms replace one entry;
     * unreachable entries can remain because every render filters them through the current graph plan. Its size is bounded by
     * style module identities observed during this server lifecycle.
     */
    const processedStyles = new Map<string, ProcessedStyle>()

    return {
        captureGraph(reader) {
            getModuleInfo = reader
        },
        captureStyle(id, style) {
            processedStyles.set(id, style)
        },
        async render(refreshTailwind) {
            if (!getModuleInfo) {
                throw new Error('WX style graph is unavailable before publication')
            }

            // App first and configured Pages afterward define one deterministic global cascade. The plan also removes stale map
            // entries implicitly: styles no longer reachable from these roots never enter composition.
            const styleIds = createGraphStylePlan(applicationEntryIds, getModuleInfo, (styleId) =>
                processedStyles.has(styleId)
            )
            if (refreshTailwind) {
                await refreshTailwindStyles(styleIds, processedStyles, transformTailwindRoot)
            }

            // Compose browser-facing transformed CSS first, then run one whole-file WX pass. Transforming modules independently
            // would change cross-module cascade behavior and duplicate compatibility work.
            const css = composeGraphStyleCss(styleIds, (styleId) => requireProcessedStyle(processedStyles, styleId).css)
            return (await transformWxStyle(css)).css
        }
    }
}

/**
 * Owns the physical WXSS frontier independently from graph capture and rendering.
 *
 * DevEngine writes complete output itself; incremental HMR does not. Observing complete output before publishing the projection
 * gives both writers one byte frontier, so equality avoids redundant filesystem notifications without pretending the host owns
 * the compiler's write transaction.
 */
function createStylePublication(outDir: string): Readonly<{
    observeOutput: (output: readonly CompleteOutputFile[]) => void
    publish: (wxss: string) => Promise<void>
}> {
    /*
     * This mutable value mirrors bytes durable on disk. Complete output adopts the compiler's external write before graph
     * reconciliation; host publication advances it only after an atomic write succeeds or byte equality proves none is needed.
     */
    let publishedWxss: string | undefined

    return {
        observeOutput(output) {
            // Missing WXSS means DevEngine intentionally reused the existing physical asset. Do not reset the frontier: doing so
            // would force an identical rewrite and a spurious DevTools style event on every omitted complete generation.
            const style = output.find(
                (file): file is Extract<CompleteOutputFile, { type: 'asset' }> =>
                    file.type === 'asset' && file.fileName === globalWxssFileName
            )
            if (style) {
                publishedWxss = typeof style.source === 'string' ? style.source : new TextDecoder().decode(style.source)
            }
        },
        async publish(wxss) {
            if (wxss !== publishedWxss) {
                // writeHmrFile uses atomic replacement; advance the frontier only after durability so a failed write leaves the
                // last known physical generation available for the next reconciliation attempt.
                await writeHmrFile(outDir, globalWxssFileName, wxss)
            }
            publishedWxss = wxss
        }
    }
}

/**
 * Regenerates all reachable Tailwind roots and commits the cache only when every transform succeeds.
 *
 * Roots run concurrently because they are independent derivations of the same candidate generation. Results remain local until
 * Promise.all fulfills; one failed root therefore preserves every prior root together instead of publishing a mixed generation.
 */
async function refreshTailwindStyles(
    styleIds: readonly string[],
    processedStyles: Map<string, ProcessedStyle>,
    transformRoot: (rootId: string, requestId: string) => Promise<Readonly<{ code: string }> | null>
): Promise<void> {
    const roots = styleIds.filter((styleId) => requireProcessedStyle(processedStyles, styleId).isTailwindRoot)
    const refreshedStyles = await Promise.all(
        roots.map(async (rootId) => {
            const requestId = createTailwindSidecarId(rootId)
            const result = await transformRoot(rootId, requestId)
            if (!result) {
                throw new Error(`Tailwind sidecar transform produced no result: ${requestId}`)
            }
            return [rootId, { css: extractViteCss(result.code, requestId), isTailwindRoot: true }] as const
        })
    )
    refreshedStyles.forEach(([rootId, style]) => {
        processedStyles.set(rootId, style)
    })
}

function requireProcessedStyle(processedStyles: ReadonlyMap<string, ProcessedStyle>, styleId: string): ProcessedStyle {
    const style = processedStyles.get(styleId)
    if (!style) {
        throw new Error(`WX style plan references uncaptured CSS: ${styleId}`)
    }
    return style
}
