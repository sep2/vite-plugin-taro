import path from 'node:path'

type AppComponentPathOptions = {
    appPath: string
    projectRoot: string
}

type PageComponentPathOptions = {
    pagePath: string
    projectRoot: string
}

/** Resolves a final relative reference to the canonical output chunk ID used by the WX module registry. */
export function resolveChunkReference(importerChunkId: string, reference: string): string {
    if (!reference.startsWith('./') && !reference.startsWith('../')) {
        throw new Error(`Expected a relative chunk reference in ${importerChunkId}: ${reference}`)
    }
    return path.posix.join(path.posix.dirname(importerChunkId), reference)
}

/** Resolves the source file for the configured App component. */
export function resolveAppComponentPath({ appPath, projectRoot }: AppComponentPathOptions): string {
    return path.resolve(projectRoot, appPath)
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
