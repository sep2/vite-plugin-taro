import type { GetModuleInfo, Plugin } from 'rolldown'
import { isCSSRequest } from 'vite'
import { normalizeModuleId } from '../../../../utils/modules.ts'
import { createGraphStylePlan, extractViteCss, isGlobalStyleRequest } from '../../styles/utils.ts'
import { publishStyleHmr, refreshTailwindStyles } from './publish-style-hmr.ts'

export type ProcessedStyle = Readonly<{
    css: string
    isTailwindRoot: boolean
}>

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
    bindPublishedWxss: (wxss: string) => void
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
        bindPublishedWxss(wxss) {
            publishedWxss = wxss
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
            publishedWxss = await publishStyleHmr({
                styleIds: styleIds,
                outDir: outDir,
                processedStyles: processedStyles,
                publishedWxss: publishedWxss
            })
        }
    }
}
