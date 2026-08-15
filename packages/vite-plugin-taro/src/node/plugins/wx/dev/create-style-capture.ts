import type { GetModuleInfo, Plugin } from 'rolldown'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { transformWxStyle } from '../styles/transform-wx-style.ts'
import { composeGraphStyleCss, createGraphStylePlan, extractViteCss, isGlobalStyleRequest } from '../styles/utils.ts'
import { globalWxssFileName, writeHmrFile } from './hmr-files.ts'

/** Final CSS extracted from Vite's transformed style module, before the shared WX compatibility pass. */
type ProcessedStyle = Readonly<{
    css: string
}>

export type StyleCaptureAction =
    | Readonly<{ kind: 'capture-graph'; getModuleInfo: GetModuleInfo }>
    | Readonly<{ kind: 'capture-style'; id: string; style: ProcessedStyle }>

/**
 * Captures final Vite CSS and publishes the ordered live-graph projection during incremental development.
 *
 * Rolldown remains authoritative for topology. Plugin hooks emit typed actions so the host serializes capture mutations with
 * patch publication. The projection owns graph and CSS state; the publisher owns only the durable WXSS byte frontier.
 */
export function createStyleCapture({
    applicationEntryIds,
    outDir,
    emit
}: {
    applicationEntryIds: readonly string[]
    outDir: string
    emit: (action: StyleCaptureAction) => void
}): Readonly<{
    captureGraph: (reader: GetModuleInfo) => void
    captureStyle: (id: string, style: ProcessedStyle) => void
    plugin: Plugin
    publish: () => Promise<void>
}> {
    const projection = createStyleProjection(applicationEntryIds)
    const publication = createStylePublication(outDir)

    const plugin: Plugin = {
        name: 'vpt:wx-dev-style-capture',
        buildStart() {
            // Capture a live reader rather than a graph snapshot. Rolldown updates this capability as imports change.
            emit({ kind: 'capture-graph', getModuleInfo: (moduleId) => this.getModuleInfo(moduleId) })
        },
        transform(code, id) {
            if (!isGlobalStyleRequest(id)) {
                return
            }

            // This host plugin runs after Vite's CSS transform, so the wrapper contains final PostCSS and CSS-Module output.
            emit({
                kind: 'capture-style',
                id: normalizeModuleId(id),
                style: { css: extractViteCss(code, id) }
            })
        }
    }

    return {
        captureGraph: projection.captureGraph,
        captureStyle: projection.captureStyle,
        plugin: plugin,
        async publish() {
            await publication.publish(await projection.render())
        }
    }
}

/**
 * Owns the live graph capability and final transformed bytes for every observed style module.
 *
 * Rendering is O(V + E + C): graph planning visits each reachable module and edge once, then composition and WX conversion
 * process C CSS bytes once. Persistent memory is one processed byte string per style identity observed by the server.
 */
function createStyleProjection(applicationEntryIds: readonly string[]): Readonly<{
    captureGraph: (reader: GetModuleInfo) => void
    captureStyle: (id: string, style: ProcessedStyle) => void
    render: () => Promise<string>
}> {
    // This mutable capability is rebound by buildStart for each complete generation and remains live across graph edits.
    let getModuleInfo: GetModuleInfo | undefined
    // This mutable projection retains CSS bytes unavailable from Rolldown. Rendering filters stale entries through the graph.
    const processedStyles = new Map<string, ProcessedStyle>()

    return {
        captureGraph(reader) {
            getModuleInfo = reader
        },
        captureStyle(id, style) {
            processedStyles.set(id, style)
        },
        async render() {
            if (!getModuleInfo) {
                throw new Error('WX style graph is unavailable before publication')
            }

            const styleIds = createGraphStylePlan(applicationEntryIds, getModuleInfo, (styleId) =>
                processedStyles.has(styleId)
            )
            const css = composeGraphStyleCss(styleIds, (styleId) => requireProcessedStyle(processedStyles, styleId).css)
            return (await transformWxStyle(css)).css
        }
    }
}

/** Owns the physical incremental WXSS frontier independently from graph capture and rendering. */
function createStylePublication(outDir: string): Readonly<{
    publish: (wxss: string) => Promise<void>
}> {
    // This mutable value advances only after an atomic write makes the exact bytes durable.
    let publishedWxss: string | undefined

    return {
        async publish(wxss) {
            if (wxss !== publishedWxss) {
                await writeHmrFile(outDir, globalWxssFileName, wxss)
            }
            publishedWxss = wxss
        }
    }
}

function requireProcessedStyle(processedStyles: ReadonlyMap<string, ProcessedStyle>, styleId: string): ProcessedStyle {
    const style = processedStyles.get(styleId)
    if (!style) {
        throw new Error(`WX style plan references uncaptured CSS: ${styleId}`)
    }
    return style
}
