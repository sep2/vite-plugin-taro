import path from 'node:path'

/** Normalizes a file-backed Vite module ID for stable comparisons. */
export function normalizeModuleId(id: string): string {
    return id.replaceAll('\\', '/').replace(/\?.*$/, '')
}

/** Converts a local file path into Vite's portable file-system import form. */
export function toViteFileImportPath(filePath: string): string {
    return `/@fs/${normalizeModuleId(path.resolve(filePath))}`
}
