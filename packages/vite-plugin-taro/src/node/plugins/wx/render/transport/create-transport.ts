import type { Rolldown } from 'vite'
import { wxBootstrapEntryName } from '../../virtual/virtual-modules.ts'
import { renderTransport } from './render-transport.ts'
import { transportFileName } from './transport.ts'

/** Creates the transport asset from the final WX bundle. */
export function createTransport(bundle: Rolldown.OutputBundle): Rolldown.EmittedAsset {
    const chunks = Object.values(bundle).flatMap((output) => (output.type === 'chunk' ? [output] : []))
    const bootstrapChunk = chunks.find((chunk) => chunk.isEntry && chunk.name === wxBootstrapEntryName)
    if (!bootstrapChunk) throw new Error('WX bootstrap entry was not emitted')
    if (bootstrapChunk.imports.length > 0 || bootstrapChunk.dynamicImports.length > 0) {
        throw new Error('WX bootstrap entry must be self-contained')
    }

    return {
        type: 'asset',
        fileName: transportFileName,
        source: renderTransport(chunks.filter((chunk) => chunk !== bootstrapChunk).map((chunk) => chunk.fileName))
    }
}
