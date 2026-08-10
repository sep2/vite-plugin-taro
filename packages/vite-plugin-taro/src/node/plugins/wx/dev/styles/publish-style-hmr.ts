import { transformWxStyle } from '../../styles/transform-wx-style.ts'
import { composeGraphStyleCss } from '../../styles/utils.ts'
import { writeHmrFile } from '../hmr-files.ts'
import type { ProcessedStyle } from './create-style-capture-plugin.ts'

type StyleHmrOptions = Readonly<{
    applicationEntryIds: readonly string[]
    getModuleInfo: (
        moduleId: string
    ) => Readonly<{ importedIds: readonly string[]; dynamicallyImportedIds: readonly string[] }> | null
    outDir: string
    processedStyles: ReadonlyMap<string, ProcessedStyle>
}>

/**
 * Materializes one host-owned style snapshot for a completed HMR transaction.
 *
 * Rolldown owns topology but does not retain Vite's final CSS module payload, while `processedStyles` owns those payloads but
 * deliberately retains no topology. `composeGraphStyleCss` joins the two projections from the resolver's ordered application
 * roots. Recomputing reachability means removed imports disappear without cache invalidation bookkeeping, and dynamic branches
 * remain global because WeChat cannot inject chunk CSS at browser runtime.
 *
 * Ordinary CSS is never transformed again here: capture already observed it after Vite/PostCSS. The composed stylesheet alone
 * receives the same final WX conversion as complete builds, then `writeHmrFile` atomically replaces the stable physical asset.
 * The caller awaits this function before exposing the corresponding JavaScript patch. Complexity is O(V + E + CSS bytes).
 */
export async function publishStyleHmr({
    applicationEntryIds,
    getModuleInfo,
    outDir,
    processedStyles
}: StyleHmrOptions): Promise<void> {
    const css = composeGraphStyleCss(applicationEntryIds, getModuleInfo, (styleId) => processedStyles.get(styleId)?.css)
    const wxss = (await transformWxStyle(css)).css
    await writeHmrFile(outDir, 'assets/global.wxss', wxss)
}
