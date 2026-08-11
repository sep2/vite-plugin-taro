import type { GetModuleInfo, Plugin } from 'rolldown'
import { isCSSRequest } from 'vite'
import { normalizeModuleId } from '../../../../utils/modules.ts'
import { transformWxStyle } from '../../styles/transform-wx-style.ts'
import {
    composeGraphStyleCss,
    createGraphStylePlan,
    createTailwindSidecarId,
    extractViteCss,
    isGlobalStyleRequest
} from '../../styles/utils.ts'
import { globalWxssFileName, writeHmrFile } from '../hmr-files.ts'

type ProcessedStyle = Readonly<{
    css: string
    isTailwindRoot: boolean
}>

type CompleteOutputFile =
    | Readonly<{ type: 'asset'; fileName: string; source: string | Uint8Array }>
    | Readonly<{ type: 'chunk'; fileName: string }>

export type StyleCaptureAction =
    | Readonly<{ kind: 'capture-graph'; getModuleInfo: GetModuleInfo }>
    | Readonly<{ kind: 'capture-style'; id: string; style: ProcessedStyle }>

/**
 * Owns capture hooks, the host's style projection, and its physical WXSS publication frontier.
 *
 * Rolldown remains authoritative for topology through its live graph reader. Plugin hooks emit typed actions so the host can
 * serialize captures with every other effect; only the matching capture methods mutate this projection.
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
    bindOutput: (output: readonly CompleteOutputFile[]) => void
    captureGraph: (reader: GetModuleInfo) => void
    captureStyle: (id: string, style: ProcessedStyle) => void
    plugin: Plugin
    publishChanged: (changedIds: readonly string[]) => Promise<void>
}> {
    // Complete builds replace this mutable live capability so later transactions always traverse Rolldown's current graph.
    let getModuleInfo: GetModuleInfo | undefined
    // Transform captures mutate this CSS projection; stale unreachable entries are harmless because each graph plan filters it.
    const processedStyles = new Map<string, ProcessedStyle>()
    // This mutable byte frontier advances only after complete output rebinding or a successful atomic HMR publication.
    let publishedWxss: string | undefined

    const plugin: Plugin = {
        name: 'vpt:wx-dev-style-capture',
        buildStart() {
            emit({ kind: 'capture-graph', getModuleInfo: (moduleId) => this.getModuleInfo(moduleId) })
        },
        transform(code, id) {
            if (!isGlobalStyleRequest(id)) {
                return
            }

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
        bindOutput(output) {
            /*
             * A complete build bypasses publishChanged and may replace physical WXSS, so its emitted bytes must rebind the
             * comparison frontier. Leaving the old frontier could make the next HMR transaction rewrite identical disk bytes or
             * skip a required rollback that happens to equal the stale value. DevEngine output carries the exact finalized asset
             * source written to disk, which makes reading that file back redundant. When a later output omits global.wxss,
             * DevEngine is preserving an unchanged physical asset, so retaining the existing frontier is the correct third case.
             */
            const style = output.find(
                (file): file is Extract<CompleteOutputFile, { type: 'asset' }> =>
                    file.type === 'asset' && file.fileName === globalWxssFileName
            )
            if (style) {
                publishedWxss = typeof style.source === 'string' ? style.source : new TextDecoder().decode(style.source)
            }
        },
        captureGraph(reader) {
            getModuleInfo = reader
        },
        captureStyle(id, style) {
            processedStyles.set(id, style)
        },
        plugin: plugin,
        async publishChanged(changedIds) {
            const styleChanged = changedIds.some(isGlobalStyleRequest)
            const candidatesChanged = changedIds.some((id) => !isCSSRequest(id))
            if (!styleChanged && !candidatesChanged) {
                return
            }
            if (!getModuleInfo) {
                throw new Error('WX style graph is unavailable before HMR publication')
            }

            // Traverse topology exactly once; root refresh and final rendering consume this immutable transaction plan.
            const styleIds = createGraphStylePlan(applicationEntryIds, getModuleInfo, (styleId) =>
                processedStyles.has(styleId)
            )
            if (candidatesChanged) {
                await refreshTailwindStyles(styleIds, processedStyles, transformTailwindRoot)
            }
            const css = composeGraphStyleCss(styleIds, (styleId) => requireProcessedStyle(processedStyles, styleId).css)
            const wxss = (await transformWxStyle(css)).css
            if (wxss !== publishedWxss) {
                await writeHmrFile(outDir, globalWxssFileName, wxss)
            }
            publishedWxss = wxss
        }
    }
}

/** Regenerates all reachable Tailwind roots and commits the cache only when every transform succeeds. */
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
