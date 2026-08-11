import { transformWxStyle } from '../../styles/transform-wx-style.ts'
import { composeGraphStyleCss, createTailwindSidecarId, extractViteCss } from '../../styles/utils.ts'
import { writeHmrFile } from '../hmr-files.ts'
import type { ProcessedStyle } from './create-style-capture.ts'

export const globalWxssFileName = 'assets/global.wxss'

type StyleHmrOptions = Readonly<{
    styleIds: readonly string[]
    outDir: string
    processedStyles: ReadonlyMap<string, ProcessedStyle>
    publishedWxss: string | undefined
}>

/** Regenerates reachable Tailwind roots concurrently from upstream's current candidate state. */
export async function refreshTailwindStyles(
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
    // Commit the cache generation only after every independent root succeeds; a failed sibling cannot leave a mixed snapshot.
    refreshedStyles.forEach(([rootId, style]) => {
        processedStyles.set(rootId, style)
    })
}

/**
 * Materializes one host-owned style snapshot for a completed HMR transaction.
 *
 * Rolldown owns topology but does not retain Vite's final CSS module payload, while `processedStyles` owns those payloads but
 * deliberately retains no topology. The caller supplies the transaction's one ordered graph plan; both Tailwind refresh and
 * this renderer consume that same snapshot, so sidecar generation cannot cause a second topology traversal.
 *
 * Ordinary CSS is never transformed again here: capture already observed it after Vite/PostCSS. The composed stylesheet alone
 * receives the same final WX conversion as complete builds. Byte equality with the host's physical publication frontier skips
 * an atomic rename that would otherwise notify DevTools despite no style change. The returned bytes advance that frontier only
 * after any required write succeeds. The caller awaits this before exposing the corresponding JavaScript patch.
 * Complexity is O(styles + CSS bytes), after the caller's O(V + E) plan traversal.
 */
export async function publishStyleHmr({
    styleIds,
    outDir,
    processedStyles,
    publishedWxss
}: StyleHmrOptions): Promise<string> {
    const css = composeGraphStyleCss(styleIds, (styleId) => requireProcessedStyle(processedStyles, styleId).css)
    const wxss = (await transformWxStyle(css)).css
    if (wxss !== publishedWxss) {
        await writeHmrFile(outDir, globalWxssFileName, wxss)
    }
    return wxss
}

function requireProcessedStyle(processedStyles: ReadonlyMap<string, ProcessedStyle>, styleId: string): ProcessedStyle {
    const style = processedStyles.get(styleId)
    if (!style) {
        throw new Error(`WX style plan references uncaptured CSS: ${styleId}`)
    }
    return style
}
