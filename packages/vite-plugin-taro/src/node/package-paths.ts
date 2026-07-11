import { createRequire } from 'node:module'
import path from 'node:path'
import { toViteFileImportPath } from './module-paths.ts'

/** Resolves package-owned dependencies and compiled runtime modules from the installed plugin location. */
export const packageRequire = createRequire(import.meta.url)
export const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))

export const h5RuntimeBridgeImportPath = toViteFileImportPath(
    path.join(packageRoot, 'dist/runtime/h5/runtime-bridge.js')
)
export const wxRuntimeBridgeImportPath = toViteFileImportPath(
    path.join(packageRoot, 'dist/runtime/wx/runtime-bridge.js')
)
export const wxHotUpdateRuntimeImportPath = toViteFileImportPath(
    path.join(packageRoot, 'dist/runtime/wx/hot-update-runtime.js')
)
export const wxUpdateClientRuntimeImportPath = toViteFileImportPath(
    path.join(packageRoot, 'dist/runtime/wx/update-client-runtime.js')
)
