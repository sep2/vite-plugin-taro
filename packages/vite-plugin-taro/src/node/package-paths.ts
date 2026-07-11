import { createRequire } from 'node:module'
import path from 'node:path'
import { toViteFileImportPath } from './utils/modules.ts'

/** Resolves package-owned dependencies and compiled runtime modules from the installed plugin location. */
export const packageRequire = createRequire(import.meta.url)
export const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))

/** Taro/React exports consumed by generated H5 entries. */
export const h5TaroRuntimeImportPath = runtimeImportPath('h5/taro-runtime.js')

/** Taro/React exports consumed by generated WX App and page entries. */
export const wxTaroRuntimeImportPath = runtimeImportPath('wx/taro-runtime.js')

/** Page-only React Refresh and Taro lifecycle coordinator. */
export const wxPageUpdateImportPath = runtimeImportPath('wx/page-update.js')

/** App-owned metadata transport and update protocol client. */
export const wxUpdateClientImportPath = runtimeImportPath('wx/update-client.js')

function runtimeImportPath(fileName: string): string {
    return toViteFileImportPath(path.join(packageRoot, 'dist/runtime', fileName))
}
