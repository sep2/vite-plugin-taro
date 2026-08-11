import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Rolldown } from 'vite'
import { isGeneratedSubpackageFile } from '../placement/plan.ts'
import { getNativeComponentSources } from './native-component-assets.ts'

/** Creates opaque native files and their registrations from each surviving JSX interface module. */
export async function createNativeComponentOutput({
    bundle,
    getModuleInfo
}: {
    bundle: Rolldown.OutputBundle
    getModuleInfo: (moduleId: string) => { meta: Rolldown.CustomPluginOptions } | null
}) {
    // Files and registrations accumulate in final chunk order for deterministic output.
    const files: Rolldown.EmittedAsset[] = []

    const registrations: {
        name: string
        componentPath: string
        fields: readonly string[]
    }[] = []

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
                const name = path.posix.basename(source.folder)
                const componentFolder = path.posix.join('components', name)
                const outputFolder = packageRoot ? path.posix.join(packageRoot, componentFolder) : componentFolder

                registrations.push({
                    name,
                    componentPath: `/${path.posix.join(outputFolder, source.entry)}`,
                    fields: source.fields
                })

                for (const asset of source.assets) {
                    // Native folders are intentionally opaque to Rolldown, so no bundle asset contains these bytes to reuse.
                    // Read each planned source once here to transfer it into the compiler-owned output bundle.
                    files.push({
                        type: 'asset',
                        fileName: path.posix.join(outputFolder, asset.relativePath),
                        source: await readFile(path.join(source.folder, asset.relativePath))
                    })
                }
            }
        }
    }

    return { files, registrations }
}
