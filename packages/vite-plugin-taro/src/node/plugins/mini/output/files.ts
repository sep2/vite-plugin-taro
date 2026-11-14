import type { Rolldown } from 'vite'
import type { VptPageOption } from '../../../../options.ts'
import type { MiniContract } from '../mini-contract.ts'
import { createNativeComponentOutput } from '../native/create-native-component-output.ts'
import type { GeneratedSubpackage, PackageLocation } from '../placer/placement.ts'

/** Creates every compiler-owned Mini Program file derived from the final Rolldown bundle. */
export async function createOutputFiles({
    bundle,
    contract,
    pages,
    subpackages,
    isProduction,
    getModuleInfo,
    getPackageLocation
}: {
    bundle: Rolldown.OutputBundle
    contract: MiniContract
    pages: readonly VptPageOption[]
    subpackages: readonly GeneratedSubpackage[]
    isProduction: boolean
    getModuleInfo: (moduleId: string) => { meta: Rolldown.CustomPluginOptions } | null
    getPackageLocation(chunk: Rolldown.OutputChunk): PackageLocation
}): Promise<Rolldown.EmittedFile[]> {
    const nativeOutput = await createNativeComponentOutput({ bundle, getModuleInfo, getPackageLocation })

    return [
        {
            type: 'asset',
            fileName: contract.styles.appFileName,
            source: `@import "./${contract.styles.globalFileName}";\n`
        },
        ...contract.output.generateProjectSkeleton(
            {
                pages: pages,
                bundle: bundle,
                subpackages: subpackages,
                nativeComponents: nativeOutput.registrations,
                isProduction: isProduction
            },
            contract
        ),
        ...nativeOutput.files
    ]
}
