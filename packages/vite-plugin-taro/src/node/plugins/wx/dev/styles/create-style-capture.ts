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
    /*
     * This mutable capability is rebound by buildStart for each complete generation. Rolldown keeps the captured function live
     * across incremental graph edits, so HMR traverses authoritative current topology without maintaining a shadow graph. It is
     * undefined only before the first buildStart; retaining an older reader across a later complete build would bind transactions
     * to the wrong engine generation, while snapshotting module data would require O(V + E) mutation on every edit.
     */
    let getModuleInfo: GetModuleInfo | undefined
    /*
     * This mutable Map is the CSS projection Rolldown does not retain: successful final transform hooks replace one module's
     * processed bytes, failed transforms intentionally leave its last valid generation, and a successful multi-root Tailwind
     * refresh commits all replacements only after every sibling resolves. Entries are not deleted when topology changes because
     * reachability comes from the live graph plan; eager deletion would need a duplicate reverse graph and could remove CSS still
     * shared by another App/Page root. Its size is bounded by style module identities seen during this server lifecycle.
     */
    const processedStyles = new Map<string, ProcessedStyle>()
    /*
     * This mutable value mirrors the WXSS bytes currently durable on disk. It has one owner but two real transition sources:
     *
     * 1. DevEngine physically writes complete output before onOutput, so bindOutput only observes and adopts that external
     *    commit. An omitted asset means DevEngine preserved the existing file and this value must remain unchanged.
     * 2. Incremental HMR is physically written by this host, so publishChanged advances the value only after its atomic write
     *    succeeds (or after byte equality proves no write was needed).
     *
     * Combining these operations behind one generic update event would still require branching between “observe an existing
     * write” and “perform a new write”, while hiding their different durability boundaries. A genuine single path would require
     * preventing DevEngine from writing complete WXSS and transferring that entire output responsibility to the host, adding
     * asset interception and ordering machinery. The two explicit methods are therefore the smallest accurate state model.
     */
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
             * Complete output is one of the two real physical writers. Its emitted asset is therefore the authoritative frontier
             * when present; omission means DevEngine preserved the existing file and this state must remain unchanged.
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
            // HMR is the second physical writer; advance the frontier only after its atomic write succeeds or was unnecessary.
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
