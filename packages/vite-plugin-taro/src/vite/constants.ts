import { createRequire } from 'node:module'
import path from 'node:path'
import { toImportPath } from './utils.ts'

export const isProd = process.env.NODE_ENV === 'production'

export const nodeRequire = createRequire(import.meta.url)

export const packageRoot = path.dirname(nodeRequire.resolve('vite-plugin-taro/package.json'))

export const h5ShimImportPath = toImportPath(path.join(packageRoot, 'dist/shim/h5.js'))
export const wxShimImportPath = toImportPath(path.join(packageRoot, 'dist/shim/wx.js'))
export const wxDevRuntimeImportPath = toImportPath(path.join(packageRoot, 'dist/shim/dev-runtime.js'))
