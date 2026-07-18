import path from 'node:path'

const moduleRoot = 'vpt:/'

type PageComponentPathOptions = {
    pagePath: string
    projectRoot: string
}

/** Converts a final chunk ID to its canonical runtime module URL. */
export function chunkIdToModuleUrl(chunkId: string): string {
    return `${moduleRoot}${chunkId}`
}

/** Resolves the source file for one configured Page component. */
export function resolvePageComponentPath({ pagePath, projectRoot }: PageComponentPathOptions): string {
    return path.resolve(projectRoot, 'src', `${pagePath}.tsx`)
}

/** Creates a portable import for one configured Page component. */
export function createPageComponentImportPath(options: PageComponentPathOptions): string {
    return toViteFileImportPath(resolvePageComponentPath(options))
}

/** Normalizes a file-backed Vite module ID for stable comparisons. */
export function normalizeModuleId(id: string): string {
    return id.replaceAll('\\', '/').replace(/\?.*$/, '')
}

/** Converts a local file path into Vite's portable file-system import form. */
export function toViteFileImportPath(filePath: string): string {
    return `/@fs/${normalizeModuleId(path.resolve(filePath))}`
}
