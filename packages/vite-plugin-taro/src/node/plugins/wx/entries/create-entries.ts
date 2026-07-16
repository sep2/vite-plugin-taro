import type { VitePluginTaroOptions } from '../../../../options.ts'
import { toViteFileImportPath } from '../../../utils/modules.ts'
import { resolvePackageFile } from '../../../utils/packages.ts'
import { bootstrapEntryName } from '../bootstrap/bootstrap-name.ts'
import { appEntryId, pagePathToEntryId } from './entry.ts'
import { renderAppEntry } from './render-app-entry.ts'
import { renderPageEntry } from './render-page-entry.ts'

const resolvedIdPrefix = '\0'
const bootstrapImportPath = toViteFileImportPath(resolvePackageFile('dist/runtime/wx/bootstrap.js'))

/** Creates the generated entries. */
export function createEntries(options: VitePluginTaroOptions) {
    const pages = options.pages.map((option) => ({
        option,
        entryId: pagePathToEntryId(option.path)
    }))
    const pageByEntryId = new Map(pages.map((page) => [page.entryId, page.option]))
    const entryIds = new Set([appEntryId, ...pages.map((page) => page.entryId)])

    return {
        input: Object.fromEntries([
            [bootstrapEntryName, bootstrapImportPath],
            ['root', appEntryId],
            ...pages.map((page) => [page.option.path, page.entryId])
        ]) satisfies Record<string, string>,

        resolveId(id: string): string | undefined {
            if (entryIds.has(id)) return `${resolvedIdPrefix}${id}`
        },

        load(id: string, projectRoot: string): string | undefined {
            if (!id.startsWith(resolvedIdPrefix)) {
                return
            }

            const entryId = id.slice(resolvedIdPrefix.length)
            if (entryId === appEntryId) {
                return renderAppEntry(options, projectRoot)
            }

            const page = pageByEntryId.get(entryId)
            if (page) {
                return renderPageEntry(page, projectRoot)
            }
        }
    }
}
