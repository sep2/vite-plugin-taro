import type { Rolldown } from 'vite'
import { isNativeModule } from '../native/is-native-module.ts'
import { transportFileName } from './constant.ts'
import { renderTransport } from './render-transport.ts'

/** Creates the transport asset from the final bundle. */
export function createTransport(bundle: Rolldown.OutputBundle): Rolldown.EmittedAsset {
    const capsuleFileNames = Object.values(bundle).flatMap((output) =>
        output.type === 'chunk' && !isNativeModule(output) ? [output.fileName] : []
    )

    return {
        type: 'asset',
        fileName: transportFileName,
        source: renderTransport(capsuleFileNames)
    }
}
