import type { Rolldown } from 'vite'
import { isBootstrapModule, isNativeModule } from '../native/is-native-module.ts'
import { transportFileName } from './constant.ts'
import { renderTransport } from './render-transport.ts'

/** Creates the transport asset from the final bundle. */
export function createTransport(bundle: Rolldown.OutputBundle): Rolldown.EmittedAsset {
    const chunks = Object.values(bundle).filter((output): output is Rolldown.OutputChunk => output.type === 'chunk')

    // Vite's preload helper makes application capsules import the native bootstrap chunk. Capture its final hashed ID so
    // transport can bridge the already-executed CommonJS exports into SystemJS instead of converting bootstrap to a capsule.
    const bootstrap = chunks.find(isBootstrapModule)
    if (!bootstrap) {
        throw new Error('Expected one native bootstrap chunk')
    }

    // Every remaining non-native chunk is already an inert System registration and can be returned directly by require.
    const capsuleChunkIds = chunks.filter((chunk) => !isNativeModule(chunk)).map((chunk) => chunk.fileName)

    return {
        type: 'asset',
        fileName: transportFileName,
        source: renderTransport({
            bootstrapChunkId: bootstrap.fileName,
            capsuleChunkIds
        })
    }
}
