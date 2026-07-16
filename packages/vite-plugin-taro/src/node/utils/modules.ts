import path from 'node:path'

/** Serializes a generated import specifier. */
export function escapeImport(moduleId: string): string {
    return JSON.stringify(moduleId)
}

/** Converts a file path to a Vite /@fs/ ID. */
export function toViteFileImportPath(filePath: string): string {
    return `/@fs/${path.resolve(filePath).replace(/\\/g, '/')}`
}
