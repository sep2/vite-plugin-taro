import type { OutputOptions } from 'rolldown'

type FileNames<Information> = string | ((information: Information) => string)
type NamingOptions = Pick<OutputOptions, 'assetFileNames' | 'chunkFileNames' | 'entryFileNames'>

/** Keeps one physical module identity throughout a live Mini Program project without changing user directory shapes. */
export function createStableOutputOptions(options: NamingOptions): NamingOptions {
    return {
        assetFileNames: stableFileNames(options.assetFileNames, 'assets/[name][extname]'),
        chunkFileNames: stableFileNames(options.chunkFileNames, 'assets/[name].js'),
        // Native entry names already include their required extension, for example app.js and pages/home/index.js.
        entryFileNames: stableFileNames(options.entryFileNames, '[name]')
    }
}

function stableFileNames<Information>(
    option: FileNames<Information> | undefined,
    fallback: string
): FileNames<Information> {
    return typeof option === 'function'
        ? (information) => stableFileName(option(information))
        : stableFileName(option ?? fallback)
}

function stableFileName(fileName: string): string {
    return fileName
        .replace(/(^|\/)\[hash(?::\d+)?\](?=\.|$)/g, '$1[name]')
        .replace(/[-_.]\[hash(?::\d+)?\]/g, '')
        .replace(/\[hash(?::\d+)?\]/g, '[name]')
}
