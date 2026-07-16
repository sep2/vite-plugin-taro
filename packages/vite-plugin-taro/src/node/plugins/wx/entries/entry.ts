import { toViteFileImportPath } from '../../../utils/modules.ts'
import { resolvePackageFile } from '../../../utils/packages.ts'

export const appEntryId = 'virtual:vite-plugin-taro/wx/app'
export const taroBridgeImportPath = toViteFileImportPath(resolvePackageFile('dist/runtime/wx/taro-bridge.js'))

const pageEntryIdPrefix = 'virtual:vite-plugin-taro/wx/page/'

/** Converts a page path to its entry module ID. */
export function pagePathToEntryId(pagePath: string): string {
    return `${pageEntryIdPrefix}${pagePath}`
}
