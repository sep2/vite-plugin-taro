import type { Rolldown } from 'vite'
import { transportFileName } from './constant.ts'
import { renderTransport } from './render-transport.ts'

/** Creates the transport asset from the final bundle. */
export function createTransport(bundle: Rolldown.OutputBundle): Rolldown.EmittedAsset {
    const capsuleFileNames = Object.values(bundle).flatMap((output) =>
        output.type === 'chunk' && !output.isEntry ? [output.fileName] : []
    )

    return {
        type: 'asset',
        fileName: transportFileName,
        source: renderTransport(capsuleFileNames)
    }
}
