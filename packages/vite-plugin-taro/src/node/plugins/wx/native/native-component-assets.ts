import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Rolldown } from 'vite'
import type { NativeComponentSchemaDefinition } from './native-component-schema.ts'

type NativeComponentAsset = {
    relativePath: string
    byteLength: number
}

export const nativeComponentMetaKey = 'vite-plugin-taro:native-components'

type NativeComponentSource = NativeComponentSchemaDefinition & {
    assets: readonly NativeComponentAsset[]
}

type NativeComponentMetadata = {
    sources: readonly NativeComponentSource[]
    assetBytes: number
}

declare module 'rolldown' {
    interface CustomPluginOptions {
        [nativeComponentMetaKey]?: NativeComponentMetadata
    }
}

/** Reads the native contribution to a transformed module's package weight. */
export function getNativeComponentAssetBytes(meta: Rolldown.CustomPluginOptions | undefined): number {
    return meta?.[nativeComponentMetaKey]?.assetBytes ?? 0
}

/** Reads native sources attached to one transformed facade module. */
export function getNativeComponentSources(meta: Rolldown.CustomPluginOptions | undefined) {
    return meta?.[nativeComponentMetaKey]?.sources ?? []
}

/** Collects a native component folder as opaque, recursively ordered assets. */
export async function collectNativeComponentAssets(
    definition: NativeComponentSchemaDefinition
): Promise<NativeComponentSource> {
    // This mutable accumulator is local to one traversal and avoids repeatedly copying growing asset arrays.
    const assets: NativeComponentAsset[] = []

    await collectDirectory(definition.folder, [], assets)

    return { ...definition, assets }
}

/** Traverses entries lexically so output remains deterministic across filesystems. */
async function collectDirectory(
    folder: string,
    segments: readonly string[],
    assets: NativeComponentAsset[]
): Promise<void> {
    const directory = path.join(folder, ...segments)
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
        const entrySegments = [...segments, entry.name]
        if (entry.isDirectory()) {
            await collectDirectory(folder, entrySegments, assets)
            continue
        }
        if (!entry.isFile()) {
            continue
        }
        const sourcePath = path.join(folder, ...entrySegments)
        assets.push({
            relativePath: entrySegments.join('/'),
            byteLength: (await stat(sourcePath)).size
        })
    }
}
