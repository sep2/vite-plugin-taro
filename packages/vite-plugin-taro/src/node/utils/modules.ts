import path from 'node:path'

const moduleRoot = 'vpt:/'

/** Converts a final chunk ID to its canonical runtime module URL. */
export function chunkIdToModuleUrl(chunkId: string): string {
    return `${moduleRoot}${chunkId}`
}

/** Creates a portable import for one configured Page component. */
export function createPageComponentImportPath({
    pagePath,
    projectRoot
}: {
    pagePath: string
    projectRoot: string
}): string {
    return toViteFileImportPath(path.resolve(projectRoot, 'src', `${pagePath}.tsx`))
}

/** Normalizes a file-backed Vite module ID for stable comparisons. */
export function normalizeModuleId(id: string): string {
    return id.replaceAll('\\', '/').replace(/\?.*$/, '')
}

/** Converts a local file path into Vite's portable file-system import form. */
export function toViteFileImportPath(filePath: string): string {
    return `/@fs/${normalizeModuleId(path.resolve(filePath))}`
}
