import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Rolldown } from 'vite'
import { isGeneratedSubpackageFile } from '../placement/plan.ts'
import { getNativeComponentSources } from './native-component-assets.ts'

/** Emits opaque native folders beside the final package containing each surviving facade module. */
export async function createNativeComponentOutputFiles({
    bundle,
    getModuleInfo
}: {
    bundle: Readonly<
        Record<string, { type: 'chunk'; fileName: string; moduleIds: readonly string[] } | { type: 'asset' }>
    >
    getModuleInfo: (moduleId: string) => { meta: Rolldown.CustomPluginOptions } | null
}): Promise<Rolldown.EmittedAsset[]> {
    // Files accumulate in final chunk order and are emitted together by the output pipeline.
    const outputFiles: Rolldown.EmittedAsset[] = []

    for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') {
            continue
        }
        const packageRoot = isGeneratedSubpackageFile(output.fileName)
            ? path.posix.dirname(path.posix.dirname(output.fileName))
            : undefined

        for (const moduleId of output.moduleIds) {
            const sources = getNativeComponentSources(getModuleInfo(moduleId)?.meta)
            for (const source of sources) {
                const componentFolder = path.posix.join('components', path.posix.basename(source.folder))
                const outputFolder = packageRoot ? path.posix.join(packageRoot, componentFolder) : componentFolder

                for (const asset of source.assets) {
                    outputFiles.push({
                        type: 'asset',
                        fileName: path.posix.join(outputFolder, asset.relativePath),
                        source: await readFile(path.join(source.folder, asset.relativePath))
                    })
                }
            }
        }
    }

    return outputFiles
}
