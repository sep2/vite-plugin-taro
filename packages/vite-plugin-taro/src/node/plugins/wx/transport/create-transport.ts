import type { Rolldown } from 'vite'
import { appShellFileName } from '../app/constant.ts'
import { transportFileName } from './constant.ts'
import { renderTransport } from './render-transport.ts'

/** Creates the transport asset from the final bundle. */
export function createTransport(bundle: Rolldown.OutputBundle): Rolldown.EmittedAsset {
    const chunks = Object.values(bundle).flatMap((output) => (output.type === 'chunk' ? [output] : []))
    const appShellChunk = chunks.find((chunk) => chunk.isEntry && chunk.name === appShellFileName)
    if (!appShellChunk) {
        throw new Error('App shell was not emitted')
    }
    if (appShellChunk.imports.length > 0 || appShellChunk.dynamicImports.length > 0) {
        throw new Error('App shell must be self-contained')
    }

    return {
        type: 'asset',
        fileName: transportFileName,
        source: renderTransport(chunks.filter((chunk) => chunk !== appShellChunk).map((chunk) => chunk.fileName))
    }
}
