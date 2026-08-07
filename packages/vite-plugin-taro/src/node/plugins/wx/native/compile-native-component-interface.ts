import path from 'node:path'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { collectNativeComponentAssets, nativeComponentMetaKey } from './native-component-assets.ts'
import { transformNativeComponentInterfaces } from './native-component-interface.ts'

/** Compiles one JSX interface module and attaches its opaque native sources to Rolldown metadata. */
export async function compileNativeComponentInterface({
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
    const transformed = transformNativeComponentInterfaces(code, id, sourcemap)
    const interfacePath = normalizeModuleId(id)

    const nativeComponents = await Promise.all(
        transformed.definitions.map((definition) => collectNativeComponentAssets(definition, interfacePath))
    )

    nativeComponents.forEach((source) => {
        addWatchFile(source.folder)

        source.assets.forEach((asset) => {
            addWatchFile(path.join(source.folder, asset.relativePath))
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
