import type { Rolldown } from 'vite'
import type { MiniContract } from '../mini-contract.d.ts'
import { createNativeComponentOutput } from '../native/create-native-component-output.ts'
import type { GeneratedSubpackage, PackageLocation } from '../placer/placement.ts'
import { createTemplateAssets } from './templates.ts'

/** Creates every compiler-owned WX file derived from the final Rolldown bundle. */
export async function createOutputFiles({
    bundle,
    contract,
    subpackages,
    isProduction,
    getModuleInfo,
    getPackageLocation
}: {
    bundle: Rolldown.OutputBundle
    contract: MiniContract
    subpackages: readonly GeneratedSubpackage[]
    isProduction: boolean
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
            contract: contract,
            subpackages: subpackages,
            nativeComponents: nativeOutput.registrations,
            isProduction: isProduction
        }),
        ...nativeOutput.files
    ]
}
