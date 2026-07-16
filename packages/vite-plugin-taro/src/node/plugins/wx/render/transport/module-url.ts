const moduleRoot = 'vpt:/'

/** Converts a chunk ID to its module URL. */
export function toModuleUrl(chunkId: string): string {
    return `${moduleRoot}${chunkId}`
}
