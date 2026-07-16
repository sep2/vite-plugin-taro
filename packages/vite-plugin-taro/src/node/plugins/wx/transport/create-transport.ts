import type { Rolldown } from 'vite'
import { bootstrapEntryName } from '../bootstrap/bootstrap-name.ts'
import { renderTransport } from './render-transport.ts'
import { transportFileName } from './transport.ts'

/** Creates the transport asset from the final bundle. */
export function createTransport(bundle: Rolldown.OutputBundle): Rolldown.EmittedAsset {
    const chunks = Object.values(bundle).flatMap((output) => (output.type === 'chunk' ? [output] : []))

    const bootstrapChunk = chunks.find((chunk) => chunk.isEntry && chunk.name === bootstrapEntryName)
    if (!bootstrapChunk) {
        throw new Error('bootstrap entry was not emitted')
    }
    if (bootstrapChunk.imports.length > 0 || bootstrapChunk.dynamicImports.length > 0) {
        throw new Error('bootstrap entry must be self-contained')
    }

    return {
        type: 'asset',
        fileName: transportFileName,
        source: renderTransport(chunks.filter((chunk) => chunk !== bootstrapChunk).map((chunk) => chunk.fileName))
    }
}
