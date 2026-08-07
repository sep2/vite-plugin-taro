import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Rolldown } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'
import type { NativeComponentDefinition } from './native-component-interface.ts'

type NativeComponentAsset = {
    relativePath: string
    byteLength: number
}

export const nativeComponentMetaKey = 'vite-plugin-taro:native-components'

type NativeComponentSource = NativeComponentDefinition & {
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

/** Reads native sources attached to one transformed JSX interface module. */
export function getNativeComponentSources(meta: Rolldown.CustomPluginOptions | undefined) {
    return meta?.[nativeComponentMetaKey]?.sources ?? []
}

/** Collects a native component folder as opaque, recursively ordered assets without copying its interface module. */
export async function collectNativeComponentAssets(
    definition: NativeComponentDefinition,
    interfacePath: string
): Promise<NativeComponentSource> {
    await requireNativeComponentDirectory(definition.folder)
    await requireNativeComponentEntry(definition)

    // This mutable accumulator is local to one traversal and avoids repeatedly copying growing asset arrays.
    const assets: NativeComponentAsset[] = []
    await collectDirectory(definition.folder, [], assets, normalizeModuleId(interfacePath))

    return { ...definition, assets }
}

/** Rejects a missing or non-directory source before Rolldown starts its recursive traversal. */
async function requireNativeComponentDirectory(folder: string): Promise<void> {
    try {
        if ((await stat(folder)).isDirectory()) {
            return
        }
    } catch (error) {
        if (Error.isError(error) && 'code' in error && error.code === 'ENOENT') {
            throw new Error(`Native component folder does not exist: ${folder}`, { cause: error })
        }
        throw error
    }
    throw new Error(`Native component source is not a directory: ${folder}`)
}

/** Rejects a missing or non-file JavaScript entry before native output registration. */
async function requireNativeComponentEntry(definition: NativeComponentDefinition): Promise<void> {
    const entryPath = path.join(definition.folder, `${definition.entry}.js`)
    try {
        if ((await stat(entryPath)).isFile()) {
            return
        }
    } catch (error) {
        if (Error.isError(error) && 'code' in error && error.code === 'ENOENT') {
            throw new Error(`Native component entry file does not exist: ${entryPath}`, { cause: error })
        }
        throw error
    }
    throw new Error(`Native component entry is not a file: ${entryPath}`)
}

/** Traverses entries lexically so output remains deterministic across filesystems. */
async function collectDirectory(
    folder: string,
    segments: readonly string[],
    assets: NativeComponentAsset[],
    interfacePath: string
): Promise<void> {
    const directory = path.join(folder, ...segments)
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
        const entrySegments = [...segments, entry.name]
        if (entry.isDirectory()) {
            await collectDirectory(folder, entrySegments, assets, interfacePath)
            continue
        }
        if (!entry.isFile()) {
            continue
        }
        const sourcePath = path.join(folder, ...entrySegments)
        if (normalizeModuleId(sourcePath) === interfacePath) {
            continue
        }
        assets.push({
            relativePath: entrySegments.join('/'),
            byteLength: (await stat(sourcePath)).size
        })
    }
}
