import type { Rolldown } from 'vite'
import { collectNativeComponentAssets, type NativeComponentSource } from './native-component-assets.ts'
import { transformNativeComponentFacades } from './native-component-schema.ts'

export const nativeComponentMetaKey = 'vite-plugin-taro:native-components'

type CompileNativeComponentFacadeResult = {
    code: string
    map: Rolldown.ExistingRawSourceMap | null
    meta: Record<typeof nativeComponentMetaKey, readonly NativeComponentSource[]>
}

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
}): Promise<CompileNativeComponentFacadeResult> {
    const transformed = transformNativeComponentFacades(code, id, sourcemap)

    const nativeComponents = await Promise.all(transformed.definitions.map(collectNativeComponentAssets))

    nativeComponents.forEach((source) => {
        addWatchFile(source.sourceDirectory)

        source.assets.forEach((asset) => {
            addWatchFile(asset.sourcePath)
        })
    })

    return {
        code: transformed.code,
        map: transformed.map,
        meta: {
            [nativeComponentMetaKey]: nativeComponents
        }
    }
}
