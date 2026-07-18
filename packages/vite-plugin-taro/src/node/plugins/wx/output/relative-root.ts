import path from 'node:path'

/** Creates a Page-relative reference to an asset emitted at the WX output root. */
export function relativeRootAsset(pagePath: string, rootAsset: string): string {
    const relativePath = path.posix.relative(path.posix.dirname(pagePath), rootAsset)
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}
