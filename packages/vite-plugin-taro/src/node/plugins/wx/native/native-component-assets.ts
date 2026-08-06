import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeModuleId } from '../../../utils/modules.ts'
import type { NativeComponentSchemaDefinition } from './native-component-schema.ts'

export type NativeComponentAsset = {
    sourcePath: string
    relativePath: string
    content: Uint8Array
}

export type NativeComponentSource = NativeComponentSchemaDefinition & {
    assets: readonly NativeComponentAsset[]
}

/** Collects a native component folder as opaque, recursively ordered assets. */
export async function collectNativeComponentAssets(
    definition: NativeComponentSchemaDefinition
): Promise<NativeComponentSource> {
    // This mutable accumulator is local to one traversal and avoids repeatedly copying growing asset arrays.
    const assets: NativeComponentAsset[] = []
    await collectDirectory(definition.sourceDirectory, [], assets)
    return { ...definition, assets }
}

/** Traverses entries lexically so output remains deterministic across filesystems. */
async function collectDirectory(
    sourceDirectory: string,
    segments: readonly string[],
    assets: NativeComponentAsset[]
): Promise<void> {
    const directory = path.join(sourceDirectory, ...segments)
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
        const entrySegments = [...segments, entry.name]
        if (entry.isDirectory()) {
            await collectDirectory(sourceDirectory, entrySegments, assets)
            continue
        }
        if (!entry.isFile()) {
            continue
        }
        const sourcePath = path.join(sourceDirectory, ...entrySegments)
        assets.push({
            sourcePath: normalizeModuleId(sourcePath),
            relativePath: entrySegments.join('/'),
            content: await readFile(sourcePath)
        })
    }
}
