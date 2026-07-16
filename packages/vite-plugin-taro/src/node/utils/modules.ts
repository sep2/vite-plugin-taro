import path from 'node:path'

export function escapeImport(moduleId: string): string {
    return JSON.stringify(moduleId)
}

export function toViteFileImportPath(filePath: string): string {
    return `/@fs/${path.resolve(filePath).replace(/\\/g, '/')}`
}
