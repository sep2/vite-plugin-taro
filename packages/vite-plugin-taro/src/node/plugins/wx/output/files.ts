import type { Rolldown } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { createNativeComponentOutput } from '../native/create-native-component-output.ts'
import type { GeneratedSubpackage, PackageLocation } from '../placer/placement.ts'
import { createTemplateAssets } from './templates.ts'

/** Creates every compiler-owned WX file derived from the final Rolldown bundle. */
export async function createOutputFiles({
    bundle,
    options,
    subpackages,
    getModuleInfo,
    getPackageLocation
}: {
    bundle: Rolldown.OutputBundle
    options: VptOptions
    subpackages: readonly GeneratedSubpackage[]
    getModuleInfo: (moduleId: string) => { meta: Rolldown.CustomPluginOptions } | null
    getPackageLocation(chunk: Rolldown.OutputChunk): PackageLocation
}): Promise<Rolldown.EmittedFile[]> {
    const nativeOutput = await createNativeComponentOutput({ bundle, getModuleInfo, getPackageLocation })

    return [
        {
            type: 'asset',
            fileName: 'app.wxss',
            source: '@import "./assets/global.wxss";\n'
        },
        ...createTemplateAssets({
            bundle: bundle,
            options: options,
            subpackages: subpackages,
            nativeComponents: nativeOutput.registrations
        }),
        ...nativeOutput.files
    ]
}
