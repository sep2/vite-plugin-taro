import { toViteFileImportPath } from '../../../utils/modules.ts'
import { resolvePackageFile } from '../../../utils/packages.ts'

export const appEntryId = '\0vpt:app'
export const taroBridgeImportPath = toViteFileImportPath(resolvePackageFile('dist/runtime/wx/taro-bridge.js'))

const pageEntryIdPrefix = '\0vpt:page/'

/** Converts a page path to its entry module ID. */
export function pagePathToEntryId(pagePath: string): `\0${string}` {
    return `${pageEntryIdPrefix}${pagePath}`
}
