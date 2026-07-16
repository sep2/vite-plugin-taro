import path from 'node:path'
import type { VitePluginTaroPageOption } from '../../../../options.ts'
import { escapeImport, toViteFileImportPath } from '../../../utils/modules.ts'
import { taroBridgeImportPath } from './entry.ts'

/** Renders one Page entry module. */
export function renderPageEntry(page: VitePluginTaroPageOption, projectRoot: string): string {
    const userPagePath = toViteFileImportPath(path.resolve(projectRoot, 'src', `${page.path}.tsx`))

    return `import { createPageConfig } from ${escapeImport(taroBridgeImportPath)}
import PageComponent from ${escapeImport(userPagePath)}
export default createPageConfig(PageComponent, ${JSON.stringify(page.path)}, { root: { cn: [] } }, ${JSON.stringify(page.config)})`
}
