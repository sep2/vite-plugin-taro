import { createRequire } from 'node:module'
import path from 'node:path'
import { toImportPath } from './module-paths.ts'

export const nodeRequire = createRequire(import.meta.url)
export const packageRoot = path.dirname(nodeRequire.resolve('vite-plugin-taro/package.json'))

export const h5RuntimeImportPath = toImportPath(path.join(packageRoot, 'dist/runtime/h5/taro-runtime.js'))
export const wxRuntimeImportPath = toImportPath(path.join(packageRoot, 'dist/runtime/wx/taro-runtime.js'))
export const wxDevelopmentRuntimeImportPath = toImportPath(
    path.join(packageRoot, 'dist/runtime/wx/development-runtime.js')
)
