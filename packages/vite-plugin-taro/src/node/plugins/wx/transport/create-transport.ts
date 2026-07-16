import type { Rolldown } from 'vite'
import { appShellFileName } from '../app/constant.ts'
import { transportFileName } from './constant.ts'
import { renderTransport } from './render-transport.ts'

/** Creates the transport asset from the final bundle. */
export function createTransport(bundle: Rolldown.OutputBundle): Rolldown.EmittedAsset {
    const appShellChunk = bundle[appShellFileName]
    if (appShellChunk?.type !== 'chunk' || !appShellChunk.isEntry) {
        throw new Error('App shell was not emitted')
    }
    if (appShellChunk.imports.length > 0) {
        throw new Error('App shell must not statically import chunks')
    }
    if (appShellChunk.dynamicImports.length !== 1) {
        throw new Error('App shell must import one App module')
    }

    const appModuleFileName = appShellChunk.dynamicImports[0]
    if (bundle[appModuleFileName]?.type !== 'chunk') {
        throw new Error('App module was not emitted')
    }

    const capsuleFileNames = Object.values(bundle).flatMap((output) =>
        output.type === 'chunk' && output !== appShellChunk ? [output.fileName] : []
    )

    return {
        type: 'asset',
        fileName: transportFileName,
        source: renderTransport(capsuleFileNames)
    }
}
