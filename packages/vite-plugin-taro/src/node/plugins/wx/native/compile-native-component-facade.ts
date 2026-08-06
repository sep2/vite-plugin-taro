import { collectNativeComponentAssets, nativeComponentMetaKey } from './native-component-assets.ts'
import { transformNativeComponentFacades } from './native-component-schema.ts'

/** Compiles one facade module and attaches its opaque native sources to Rolldown metadata. */
export async function compileNativeComponentFacade({
    code,
    id,
    sourcemap,
    addWatchFile
}: {
    code: string
    id: string
    sourcemap: boolean
    addWatchFile: (file: string) => void
}) {
    const transformed = transformNativeComponentFacades(code, id, sourcemap)

    const nativeComponents = await Promise.all(transformed.definitions.map(collectNativeComponentAssets))

    nativeComponents.forEach((source) => {
        addWatchFile(source.folder)

        source.assets.forEach((asset) => {
            addWatchFile(asset.sourcePath)
        })
    })

    const assetBytes = nativeComponents.reduce((sourceTotal, source) => {
        return sourceTotal + source.assets.reduce((assetTotal, asset) => assetTotal + asset.byteLength, 0)
    }, 0)

    return {
        code: transformed.code,
        map: transformed.map,
        meta: {
            [nativeComponentMetaKey]: {
                sources: nativeComponents,
                assetBytes
            }
        }
    }
}
