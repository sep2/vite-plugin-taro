import path from 'node:path'

/** Creates a Page-relative path to a file emitted at the wx output root. */
export function toRootRelativePath(pagePath: string, rootFileName: string): string {
    const relativePath = path.posix.relative(path.posix.dirname(pagePath), rootFileName)
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}
