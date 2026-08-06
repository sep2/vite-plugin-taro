import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { normalizeModuleId } from '../../../utils/modules.ts'
import type { NativeComponentSchemaDefinition } from './native-component-schema.ts'

type NativeComponentAsset = {
    sourcePath: string
    relativePath: string
    byteLength: number
}

export const nativeComponentMetaKey = 'vite-plugin-taro:native-components'

/** Reads the native contribution to a transformed module's package weight. */
export function getNativeComponentAssetBytes(meta: Readonly<Record<string, unknown>> | undefined): number {
    const metadata: unknown = meta?.[nativeComponentMetaKey]
    if (typeof metadata !== 'object' || metadata === null) {
        return 0
    }

    const assetBytes: unknown = Reflect.get(metadata, 'assetBytes')

    return typeof assetBytes === 'number' ? assetBytes : 0
}

/** Collects a native component folder as opaque, recursively ordered assets. */
export async function collectNativeComponentAssets(definition: NativeComponentSchemaDefinition) {
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
            sourcePath: normalizeModuleId(sourcePath),
            relativePath: entrySegments.join('/'),
            byteLength: (await stat(sourcePath)).size
        })
    }
}
