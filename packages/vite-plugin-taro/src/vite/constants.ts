import { createRequire } from 'node:module'
import path from 'node:path'

export const isProd = process.env.NODE_ENV === 'production'

export const nodeRequire = createRequire(import.meta.url)

const packageRoot = path.dirname(nodeRequire.resolve('vite-plugin-taro/package.json'))

export const h5ShimImportPath = normalizeFileImport(path.join(packageRoot, 'dist/shim/h5.js'))
export const wxShimImportPath = normalizeFileImport(path.join(packageRoot, 'dist/shim/wx.js'))

function normalizeFileImport(filePath: string): string {
    return filePath.replace(/\\/g, '/')
}
